const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const Module = require('../_class');
const directorySearch = require('../../functions/directorySearch');
const modules = require('../../modules');
const setupSwagger = require('./swagger');

/**
 * @description Рекурсивно удаляет ключи, начинающиеся с '$', для защиты от NoSQL-инъекций
 */
function sanitize(obj) {
    if (Array.isArray(obj)) return obj.map(sanitize);
    if (obj && typeof obj === 'object') {
        const result = {};
        for (const key of Object.keys(obj)) {
            if (!key.startsWith('$')) result[key] = sanitize(obj[key]);
        }
        return result;
    }
    return obj;
}

class API extends Module {
    /** @returns {typeof import('./config.json')} */
    getConfig() { return super.getConfig(); }

    /**
     * @param {*} res res
     * @param {Object|String} data Ответ, который необходимо вывести
     * @param {Number} code Код ответа
     * @description Возвращает ответ пользователю на API запрос
     */
    static send(res, data, code = 200) { res.status(code).send(code < 400 ? { response: data } : { error: data }) }

    /** @type {express.Express} */
    #express;
    #activeRequests = 0;
    #draining = false;

    #initExpress() {
        this.#express = express();

        // Security middleware
        this.#express.use(helmet());
        this.#express.use(cors(this.getConfig().cors || {}));

        // Глобальный rate limit (в TEST_MODE отключаем — для нагрузочных/интеграционных тестов)
        if (process.env.TEST_MODE !== 'true') {
            const rl = this.getConfig().rateLimit || {};
            const options = {
                windowMs: rl.windowMs || 15 * 60 * 1000,
                max: rl.max || 100,
                standardHeaders: true,
                legacyHeaders: false,
            };
            const redisClient = modules.cache?.client;
            if (redisClient) {
                try {
                    const { RedisStore } = require('rate-limit-redis');
                    options.store = new RedisStore({ sendCommand: (...args) => redisClient.call(...args), prefix: 'rl:global:' });
                } catch (_e) { /* in-memory fallback */ }
            }
            this.#express.use(rateLimit(options));
        }

        // Статика
        this.#express.use('/', express.static(path.join(this.getDirname(), this.getConfig().paths.static)));

        // Кастомные заголовки
        const headers = this.getConfig().headers;
        if (headers instanceof Array && headers.length > 0)
            this.#express.use((req, res, next) => {
                for (let i = 0; i < headers.length; i++) {
                    const header = headers[i];
                    if ('name' in header && 'value' in header) res.setHeader(header.name, header.value);
                }
                next();
            });

        this.#express.use((req, res, next) => {
            if (req.method === 'OPTIONS') return API.send(res, 'OK');
            next();
        });

        // Request ID для трассировки
        this.#express.use((req, _res, next) => { req.requestId = crypto.randomUUID(); next(); });

        // Drain guard: отклоняем новые запросы при graceful shutdown, считаем активные
        this.#express.use((req, res, next) => {
            if (this.#draining) return API.send(res, { code: -3, message: 'Сервер завершает работу' }, 503);
            this.#activeRequests++;
            res.on('finish', () => { this.#activeRequests--; });
            next();
        });

        // Body-парсеры и NoSQL-санитайз подключаются per-route в methods/_class.js,
        // чтобы можно было задавать индивидуальный bodyLimit через config.bodyLimit метода.

        // Защита от XSS-векторов в query-параметрах (req.query read-only в Express 5).
        // SQL-паттерны намеренно НЕ проверяем: стек — MongoDB (SQL-инъекций нет), а NoSQL-инъекции
        // закрыты sanitize() по '$'-ключам. SQL-фильтр давал ложные срабатывания на легитимных query.
        const INJECTION_RE = /<script|javascript:|on\w+\s*=/i;
        this.#express.use((req, res, next) => {
            for (const val of Object.values(req.query || {})) {
                if (typeof val === 'string' && INJECTION_RE.test(val)) {
                    return API.send(res, { code: -2, message: 'Недопустимые символы в параметрах' }, 400);
                }
            }
            next();
        });

        // Логирование запросов с requestId, body/query/headers/response, длительностью
        const SAFE_HEADERS = ['user-agent', 'content-type', 'accept-language', 'x-forwarded-for', 'x-real-ip', 'referer', 'origin'];
        const MAX_BODY_SIZE = 4096;
        function truncateForLog(value) {
            if (value == null) return null;
            const str = typeof value === 'string' ? value : JSON.stringify(value);
            if (str.length <= MAX_BODY_SIZE) return value;
            return { _truncated: true, preview: str.slice(0, MAX_BODY_SIZE) };
        }
        this.#express.use((req, res, next) => {
            const start = Date.now();

            // Перехватываем res.send для сохранения тела ответа
            const originalSend = res.send.bind(res);
            let capturedResponse = null;
            res.send = function (body) { capturedResponse = body; return originalSend(body); };

            res.on('finish', () => {
                // Не логируем запросы на незарегистрированные эндпоинты
                if (!req.route) return;

                const duration = Date.now() - start;
                const userId = req.user?.id ?? req.user?.sub ?? req.user_id ?? null;
                const msg = `[${req.requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;

                const safeHeaders = {};
                for (const h of SAFE_HEADERS) if (req.headers[h]) safeHeaders[h] = req.headers[h];

                let responseBody = null;
                if (capturedResponse != null) {
                    try {
                        responseBody = truncateForLog(typeof capturedResponse === 'string' ? JSON.parse(capturedResponse) : capturedResponse);
                    } catch {
                        responseBody = truncateForLog(capturedResponse);
                    }
                }

                const extra = {
                    requestId: req.requestId,
                    toDB: res.statusCode >= 400,
                    http_method: req.method,
                    url: req.originalUrl,
                    status_code: res.statusCode,
                    duration_ms: duration,
                    request_body: req.method !== 'GET' && req.body && Object.keys(req.body).length ? truncateForLog(req.body) : null,
                    request_query: req.query && Object.keys(req.query).length ? req.query : null,
                    request_headers: Object.keys(safeHeaders).length ? safeHeaders : null,
                    response_body: responseBody,
                };

                const level = res.statusCode >= 400 ? 'warn' : 'info';
                modules.logger?.log(level, msg, userId, extra);
            });
            next();
        });
    }

    #initMethod() {
        directorySearch(
            path.join(this.getDirname(), this.getConfig().paths.methods),
            file_path => {
                const splited = file_path.replace(/\\/g, '/').split('/');
                /** @type {import('./methods/_class')} */
                new (require(file_path))('/' + this.getConfig().sub_url + '/' + splited.slice(splited.findIndex(e => e === this.getConfig().paths.methods.split('/').reverse()[0]) + 1, splited.length - 1).join('/'), this.#express);
            },
            'index.js',
            true
        );
    }

    /** @type {http.Server} */
    #server;

    async startFunction() {
        this.#initExpress();
        this.#initMethod();
        setupSwagger(this.#express);

        // TLS терминируется внешним nginx — приложение слушает plain HTTP
        this.#server = http.createServer(this.#express);

        await new Promise((res) => {
            const port = Number(this.getConfig().port) || 3000;
            this.#server.listen(port, () => {
                modules.logger.log('info', `HTTP сервер запущен, порт: ${port}`);
                res(true);
            });
        });
    }

    async stopFunction() {
        this.#draining = true;
        this.#server.closeIdleConnections?.();

        // Ждём завершения активных запросов (до 5 секунд)
        const deadline = Date.now() + 5000;
        while (this.#activeRequests > 0 && Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 100));
        }

        await new Promise((resolve) => {
            this.#server.close(() => {
                modules.logger.log('info', 'Сервер остановлен');
                resolve(true);
            });
            setTimeout(() => this.#server.closeAllConnections?.(), 2000);
        });
    }

    // Передача _dirname, так как класс API используется для класса Socket
    constructor(_dirname = __dirname) { super(_dirname) }
}

API.sanitize = sanitize;

module.exports = API;
