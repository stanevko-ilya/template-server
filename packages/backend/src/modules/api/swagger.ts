import fs from 'node:fs';
import path from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';

import directorySearch from '../../functions/directorySearch.js';
import { runtimeExt, importDefault } from '../../functions/importModule.js';
import { getJwtSecret } from '../../functions/jwtSecret.js';
import { schemas as responseSchemas } from './swagger-schemas.js';
import type { MethodConfig } from './methods/_class.js';
import type { ParamSpec } from '@template-server/shared';

// ---- Стандартные ошибки (совпадают с modules/api/methods/_class.ts) ----
const STANDARD_ERRORS: Record<string, string> = {
    '-1': 'Ошибка во время выполнения запроса',
    '-2': 'Ошибка во время проверки параметров запроса',
    '-3': 'Метод отключён',
    '-4': 'Необходима авторизация',
    '-5': 'Недостаточно прав',
};

// ---- Маппинг типов параметров config → OpenAPI ----
function mapParamSchema(param: ParamSpec): Record<string, any> {
    const schema: Record<string, any> = {};

    switch (param.type) {
        case 'string':
            schema.type = 'string';
            break;
        case 'number':
            schema.type = 'integer';
            break;
        case 'boolean':
            schema.type = 'boolean';
            break;
        case 'objectId':
            schema.type = 'string';
            schema.format = 'objectId';
            schema.description = 'MongoDB ObjectId (24 hex-символа)';
            break;
        case 'object':
            schema.type = 'object';
            break;
        case 'array':
            schema.type = 'array';
            schema.items = {};
            break;
        default:
            schema.type = 'string';
    }

    if (param.interval) {
        schema.exclusiveMinimum = param.interval[0];
        schema.exclusiveMaximum = param.interval[1];
    }
    if (param.valid_values) schema.enum = param.valid_values;
    if (param.orientation) {
        schema.description =
            (schema.description ? schema.description + '. ' : '') +
            `Принудительно ${param.orientation === 'positive' ? 'положительное' : 'отрицательное'}`;
    }

    return schema;
}

// ---- Построение OpenAPI path item для одного метода ----
function buildPathItem(url: string, config: MethodConfig): Record<string, any> {
    const operation: Record<string, any> = {};

    operation.summary = config.summary || url;

    // Тег: из config.tag или первого сегмента URL
    const firstSegment = url.replace(/^\/api\//, '').split('/')[0] || 'default';
    operation.tags = [config.tag || firstSegment];

    // Security
    if (config.auth) operation.security = [{ BearerAuth: [] }];
    else if (config.service_key) operation.security = [{ ServiceKey: [] }];

    // Параметры
    const params = config.params || [];
    const hasParams = params.length > 0;
    const isGet = config.method === 'get';

    if (isGet) {
        const queryParams = params.map((p) => ({
            in: 'query',
            name: p.name,
            required: !!p.required,
            schema: mapParamSchema(p),
        }));
        if (queryParams.length > 0) operation.parameters = queryParams;
    } else {
        const properties: Record<string, any> = {};
        const required: string[] = [];
        for (const p of params) {
            properties[p.name] = mapParamSchema(p);
            if (p.required) required.push(p.name);
        }
        if (Object.keys(properties).length > 0) {
            operation.requestBody = {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            ...(required.length > 0 ? { required } : {}),
                            properties,
                        },
                    },
                },
            };
        }
    }

    // Responses
    if (config.response && config.response.ref && responseSchemas[config.response.ref]) {
        operation.responses = {
            200: {
                description: config.response.description || 'Успешный ответ',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: { response: { $ref: `#/components/schemas/${config.response.ref}` } },
                        },
                    },
                },
            },
        };
    } else if (config.response && config.response.schema) {
        operation.responses = {
            200: {
                description: config.response.description || 'Успешный ответ',
                content: {
                    'application/json': {
                        schema: { type: 'object', properties: { response: config.response.schema } },
                    },
                },
            },
        };
    } else {
        operation.responses = {
            200: {
                description: 'Успешный ответ',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
            },
        };
    }

    // 400 — ошибки параметров и бизнес-логики
    const errorRows: string[] = [];
    if (hasParams) errorRows.push(`| -2 | ${STANDARD_ERRORS['-2']} |`);
    if (config.errors) for (const e of config.errors) errorRows.push(`| ${e.code} | ${e.message} |`);
    if (errorRows.length > 0) {
        operation.responses[400] = {
            description: '| Код | Описание |\n|-----|----------|\n' + errorRows.join('\n'),
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        };
    }

    if (config.auth) {
        operation.responses[401] = {
            description: 'Необходима авторизация (невалидный/отсутствующий токен)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        };
        operation.responses[403] = {
            description: 'Недостаточно прав (роль)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        };
    }

    if (config.service_key) {
        operation.responses[403] = {
            description: 'Доступ запрещён (невалидный служебный ключ)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        };
    }

    operation.responses[500] = {
        description: 'Внутренняя ошибка сервера',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
    };

    if (config.use !== undefined) {
        operation.responses[503] = {
            description: 'Метод отключён',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        };
    }

    return operation;
}

// ---- Генерация полной OpenAPI спецификации ----
export async function buildSpec(): Promise<Record<string, any>> {
    const methodsDir = path.join(import.meta.dirname, 'methods');
    const ext = runtimeExt(import.meta.filename);
    const paths: Record<string, Record<string, any>> = {};

    const configFiles = directorySearch(methodsDir, `config${ext}`, true);
    for (const configPath of configFiles) {
        let config: MethodConfig;
        try {
            config = await importDefault<MethodConfig>(configPath);
        } catch {
            continue;
        }

        // Отключённые методы (use:false) не документируем — они отдают 503.
        if (config.use === false) continue;

        let url: string;
        if (typeof config.url === 'string' && config.url.length > 0) {
            url = '/api' + (config.url.startsWith('/') ? config.url : '/' + config.url);
        } else {
            const segments = configPath.replace(/\\/g, '/').split('/');
            const methodsIndex = segments.findIndex((s) => s === 'methods');
            const pathParts = segments.slice(methodsIndex + 1, -1); // без config-файла
            url = '/api/' + pathParts.join('/');
        }

        if (!paths[url]) paths[url] = {};
        paths[url][config.method || 'get'] = buildPathItem(url, config);
    }

    return {
        openapi: '3.0.0',
        info: {
            title: process.env.SWAGGER_TITLE || 'Template Server API',
            version: '1.0.0',
            description: [
                'REST API на базе template-server.',
                '',
                '## Авторизация',
                'Эндпоинты с `auth` требуют JWT в заголовке:',
                '```',
                'Authorization: Bearer <token>',
                '```',
                'Нажмите **Authorize** и вставьте токен — он будет подставляться автоматически в «Try it out».',
                '',
                '## Служебный ключ (X-Service-Key)',
                'Для служебных эндпоинтов и доступа к этой документации используется `SERVICE_KEY`:',
                '```',
                'X-Service-Key: <SERVICE_KEY>',
                '```',
            ].join('\n'),
        },
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT-токен (Authorization: Bearer <token>)',
                },
                ServiceKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-Service-Key',
                    description: 'Служебный ключ из переменной окружения SERVICE_KEY',
                },
            },
            schemas: {
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'object',
                            required: ['code', 'message'],
                            properties: {
                                code: { type: 'integer', description: 'Код ошибки' },
                                message: { type: 'string', description: 'Описание ошибки' },
                                param_name: { type: 'string', description: 'Имя невалидного параметра (для кода -2)' },
                            },
                        },
                    },
                },
                SuccessResponse: {
                    type: 'object',
                    properties: { response: { description: 'Тело ответа (структура зависит от метода)' } },
                },
                ...responseSchemas,
            },
        },
        paths,
    };
}

// Имя cookie-сессии Swagger UI (см. swaggerAuthMiddleware).
const SWAGGER_COOKIE = 'swagger_session';
// Срок жизни сессии Swagger UI (совпадает с maxAge cookie и проверяется на сервере).
const SWAGGER_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 часов

/** Сравнение строк за константное время (защита от timing-атак на ключ/токен). */
function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
}

/**
 * Подпись сессии — HMAC(secret, "swagger-ui:<serviceKey>:<exp>"). Секрет берём из
 * getJwtSecret(): если JWT_SECRET не задан — это случайный секрет процесса, а НЕ сам ключ,
 * поэтому по значению cookie нельзя офлайн-перебором восстановить SERVICE_KEY, и сам ключ
 * в cookie не хранится. exp входит в подпись — срок нельзя подделать.
 */
function swaggerSessionSig(serviceKey: string, exp: number): string {
    return createHmac('sha256', getJwtSecret())
        .update(`swagger-ui:${serviceKey}:${exp}`)
        .digest('hex');
}

/** Выпускает значение cookie-сессии вида "<exp>.<подпись>" со сроком SWAGGER_SESSION_TTL_MS. */
function issueSwaggerSession(serviceKey: string): string {
    const exp = Date.now() + SWAGGER_SESSION_TTL_MS;
    return `${exp}.${swaggerSessionSig(serviceKey, exp)}`;
}

/** Проверяет cookie-сессию: корректная подпись И не истёкший срок (проверка на сервере). */
function isValidSwaggerSession(cookieValue: string | undefined, serviceKey: string): boolean {
    if (!cookieValue) return false;
    const dot = cookieValue.indexOf('.');
    if (dot <= 0) return false;
    const exp = Number(cookieValue.slice(0, dot));
    if (!Number.isFinite(exp) || exp <= Date.now()) return false;
    return safeEqual(cookieValue.slice(dot + 1), swaggerSessionSig(serviceKey, exp));
}

/** Читает значение cookie из заголовка Cookie (без внешних зависимостей). */
function readCookie(header: string | undefined, name: string): string | undefined {
    if (!header) return undefined;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
    }
    return undefined;
}

/**
 * Middleware авторизации для Swagger UI по SERVICE_KEY.
 *
 * Защищает ВСЕ ресурсы под /api/docs (в первую очередь swagger-ui-init.js, куда
 * swagger-ui-express встраивает всю OpenAPI-спеку, и catch-all HTML). Раньше проверка
 * стояла только для '/', '' и '/index.html', а остальные пути пропускались через next(),
 * из-за чего спеку можно было получить без ключа (напр. GET /api/docs/swagger-ui-init.js).
 *
 * Ключ принимается из заголовка X-Service-Key, query (?key=) или cookie-сессии, которая
 * выставляется после первой успешной проверки по query — чтобы статические ассеты
 * swagger-ui (запрашиваются относительными URL без ?key=) проходили проверку. Cookie-сессия
 * подписана (getJwtSecret) и имеет серверный срок; сам SERVICE_KEY в ней не хранится.
 */
export function swaggerAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
    const serviceKey = process.env.SERVICE_KEY;
    if (!serviceKey) {
        res.status(403).json({ error: { code: -5, message: 'Служебный ключ не настроен (SERVICE_KEY)' } });
        return;
    }

    const headerKey = req.headers['x-service-key'];
    const queryKey = typeof req.query.key === 'string' ? req.query.key : undefined;
    const sessionCookie = readCookie(req.headers.cookie, SWAGGER_COOKIE);

    const isKey = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && safeEqual(v, serviceKey);

    if (!isKey(headerKey) && !isKey(queryKey) && !isValidSwaggerSession(sessionCookie, serviceKey)) {
        res.status(403).send(
            'Доступ запрещён. Используйте заголовок X-Service-Key или откройте /api/docs/?key=YOUR_SERVICE_KEY',
        );
        return;
    }

    // Успешный вход по query → ставим httpOnly cookie-сессию, чтобы последующие запросы
    // к ассетам (без ?key= в URL) проходили проверку.
    if (isKey(queryKey)) {
        res.cookie(SWAGGER_COOKIE, issueSwaggerSession(serviceKey), {
            httpOnly: true,
            sameSite: 'strict',
            secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
            path: req.baseUrl || '/api/docs',
            maxAge: SWAGGER_SESSION_TTL_MS,
        });
    }

    // Нормализуем корень без завершающего слэша (/api/docs → /api/docs/): иначе
    // относительные ссылки на ассеты (./swagger-ui-init.js) резолвятся выше mount-пути.
    // Query (в т.ч. ?key=) в целевой URL НЕ переносим — cookie уже выставлена на этом же
    // ответе, поэтому SERVICE_KEY не попадает в Location/историю браузера/логи прокси.
    const rawPath = req.originalUrl.split('?')[0];
    if (req.path === '/' && !rawPath.endsWith('/')) {
        res.redirect((req.baseUrl || '/api/docs') + '/');
        return;
    }

    next();
}

/**
 * Регистрирует Swagger UI и экспортирует спецификацию в swagger.json.
 * Включается только при SWAGGER_ENABLED=true. Спека регенерируется при каждом старте.
 */
export async function setupSwagger(app: Express): Promise<void> {
    if (process.env.SWAGGER_ENABLED !== 'true') return;

    // Ленивый импорт: swagger-ui-express нужен только при включённой документации
    let swaggerUi: any;
    try {
        swaggerUi = (await import('swagger-ui-express')).default;
    } catch {
        console.warn('[swagger] SWAGGER_ENABLED=true, но swagger-ui-express не установлен — документация пропущена');
        return;
    }

    const spec = await buildSpec();

    // Экспорт спеки в файл (удобно для клиентов/кодогенерации)
    try {
        fs.writeFileSync(path.join(process.cwd(), 'swagger.json'), JSON.stringify(spec, null, 2));
    } catch {
        /* не критично */
    }

    app.use(
        '/api/docs',
        swaggerAuthMiddleware,
        swaggerUi.serve,
        swaggerUi.setup(spec, {
            customSiteTitle: process.env.SWAGGER_TITLE || 'Template Server API',
        }),
    );
}

export default setupSwagger;
