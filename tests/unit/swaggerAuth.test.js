const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const { swaggerAuthMiddleware } = require('../../modules/api/swagger');

const KEY = 'test-service-key-abc123';
const JWT = 'fixed-jwt-secret-for-tests';

/** Повторяет серверный алгоритм подписи сессии — для проверки серверной валидации срока/подписи. */
function makeSession(serviceKey, exp) {
    const sig = crypto.createHmac('sha256', JWT).update(`swagger-ui:${serviceKey}:${exp}`).digest('hex');
    return `swagger_session=${exp}.${sig}`;
}

/**
 * Минимальное приложение, повторяющее реальную цепочку монтирования Swagger:
 * app.use('/api/docs', swaggerAuthMiddleware, <swagger-ui>). Вместо swagger-ui
 * отдаём маркер — проверяем именно поведение middleware-гейта.
 */
function makeApp() {
    const app = express();
    app.use('/api/docs', swaggerAuthMiddleware, (req, res) => {
        res.status(200).send('SWAGGER-CONTENT:' + req.path);
    });
    return app;
}

/** Достаёт значение cookie swagger_session из заголовка Set-Cookie ответа. */
function extractSessionCookie(res) {
    const raw = res.headers['set-cookie'];
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const cookie = arr.find((c) => c.startsWith('swagger_session='));
    if (!cookie) throw new Error('Set-Cookie swagger_session отсутствует');
    return cookie.split(';')[0];
}

describe('swaggerAuthMiddleware — гейт доступа к /api/docs', () => {
    let app;

    beforeAll(() => {
        process.env.SERVICE_KEY = KEY;
        process.env.JWT_SECRET = JWT;
        app = makeApp();
    });

    // ─────────── Регресс уязвимости: ассеты без ключа ───────────

    it('РЕГРЕСС: swagger-ui-init.js БЕЗ ключа → 403 (спека не утекает)', async () => {
        const res = await request(app).get('/api/docs/swagger-ui-init.js');
        expect(res.status).toBe(403);
        expect(res.text).not.toContain('SWAGGER-CONTENT');
    });

    it('РЕГРЕСС: произвольный путь (sign-script.js) БЕЗ ключа → 403 (catch-all HTML не утекает)', async () => {
        const res = await request(app).get('/api/docs/sign-script.js');
        expect(res.status).toBe(403);
    });

    it('корень /api/docs/ БЕЗ ключа → 403', async () => {
        const res = await request(app).get('/api/docs/');
        expect(res.status).toBe(403);
    });

    // ─────────── Доступ по ключу ───────────

    it('заголовок X-Service-Key открывает любой ассет', async () => {
        const res = await request(app).get('/api/docs/swagger-ui-init.js').set('X-Service-Key', KEY);
        expect(res.status).toBe(200);
        expect(res.text).toContain('SWAGGER-CONTENT');
    });

    it('неверный ?key= → 403', async () => {
        const res = await request(app).get('/api/docs/?key=wrong-key');
        expect(res.status).toBe(403);
    });

    it('верный ?key= на корне → 200 и ставит подписанную cookie-сессию (<exp>.<sig>)', async () => {
        const res = await request(app).get('/api/docs/?key=' + encodeURIComponent(KEY));
        expect(res.status).toBe(200);
        expect(extractSessionCookie(res)).toMatch(/^swagger_session=\d+\.[a-f0-9]{64}$/);
    });

    // ─────────── Cookie-сессия ───────────

    it('cookie, полученная по ключу, открывает ассеты без ?key=', async () => {
        const login = await request(app).get('/api/docs/?key=' + encodeURIComponent(KEY));
        const cookie = extractSessionCookie(login);

        const res = await request(app).get('/api/docs/swagger-ui-init.js').set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.text).toContain('SWAGGER-CONTENT');
    });

    it('поддельная cookie swagger_session → 403', async () => {
        const res = await request(app)
            .get('/api/docs/swagger-ui-init.js')
            .set('Cookie', 'swagger_session=deadbeefdeadbeef');
        expect(res.status).toBe(403);
    });

    it('корректно подписанная НЕистёкшая сессия → 200', async () => {
        const res = await request(app)
            .get('/api/docs/swagger-ui-init.js')
            .set('Cookie', makeSession(KEY, Date.now() + 60000));
        expect(res.status).toBe(200);
    });

    it('РЕГРЕСС: истёкшая (но корректно подписанная) сессия → 403 (серверная проверка срока)', async () => {
        const res = await request(app)
            .get('/api/docs/swagger-ui-init.js')
            .set('Cookie', makeSession(KEY, Date.now() - 1000));
        expect(res.status).toBe(403);
    });

    it('подделка срока (exp в значении ≠ exp в подписи) → 403', async () => {
        const exp = Date.now() + 60000;
        const sig = crypto.createHmac('sha256', JWT).update(`swagger-ui:${KEY}:${exp - 1}`).digest('hex');
        const res = await request(app)
            .get('/api/docs/swagger-ui-init.js')
            .set('Cookie', `swagger_session=${exp}.${sig}`);
        expect(res.status).toBe(403);
    });

    // ─────────── Нормализация завершающего слэша ───────────

    it('/api/docs (без слэша) с ключом → 302 на /api/docs/ БЕЗ ключа в Location (ключ не утекает)', async () => {
        const res = await request(app).get('/api/docs?key=' + encodeURIComponent(KEY));
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/api/docs/');
        expect(extractSessionCookie(res)).toMatch(/^swagger_session=\d+\.[a-f0-9]{64}$/);
    });

    // ─────────── Ключ в query-массиве не роняет middleware ───────────

    it('?key=a&key=b (массив) трактуется как отсутствие ключа → 403', async () => {
        const res = await request(app).get('/api/docs/?key=a&key=b');
        expect(res.status).toBe(403);
    });

    // ─────────── Не настроен SERVICE_KEY ───────────

    it('SERVICE_KEY не задан → 403 с кодом -5 даже при попытке передать ключ', async () => {
        const saved = process.env.SERVICE_KEY;
        delete process.env.SERVICE_KEY;
        try {
            const res = await request(app).get('/api/docs/swagger-ui-init.js').set('X-Service-Key', 'anything');
            expect(res.status).toBe(403);
            expect(res.body && res.body.error && res.body.error.code).toBe(-5);
        } finally {
            process.env.SERVICE_KEY = saved;
        }
    });
});
