const path = require('path');
const fs = require('fs');
const directorySearch = require('../../functions/directorySearch');
const { schemas: responseSchemas } = require('./swagger-schemas');

// ---- Стандартные ошибки (совпадают с modules/api/methods/_class.js) ----
const STANDARD_ERRORS = {
    '-1': 'Ошибка во время выполнения запроса',
    '-2': 'Ошибка во время проверки параметров запроса',
    '-3': 'Метод отключён',
    '-4': 'Необходима авторизация',
    '-5': 'Недостаточно прав',
};

// ---- Маппинг типов параметров config → OpenAPI ----
function mapParamSchema(param) {
    const schema = {};

    switch (param.type) {
        case 'string': schema.type = 'string'; break;
        case 'number': schema.type = 'integer'; break;
        case 'boolean': schema.type = 'boolean'; break;
        case 'objectId':
            schema.type = 'string';
            schema.format = 'objectId';
            schema.description = 'MongoDB ObjectId (24 hex-символа)';
            break;
        case 'object': schema.type = 'object'; break;
        case 'array':
            schema.type = 'array';
            schema.items = {};
            break;
        default: schema.type = 'string';
    }

    if (param.interval) {
        schema.exclusiveMinimum = param.interval[0];
        schema.exclusiveMaximum = param.interval[1];
    }
    if (param.valid_values) schema.enum = param.valid_values;
    if (param.orientation) {
        schema.description = (schema.description ? schema.description + '. ' : '') +
            `Принудительно ${param.orientation === 'positive' ? 'положительное' : 'отрицательное'}`;
    }

    return schema;
}

// ---- Построение OpenAPI path item для одного метода ----
function buildPathItem(url, config) {
    const operation = {};

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
        const queryParams = params.map(p => ({
            in: 'query',
            name: p.name,
            required: !!p.required,
            schema: mapParamSchema(p),
        }));
        if (queryParams.length > 0) operation.parameters = queryParams;
    } else {
        const properties = {};
        const required = [];
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
    const errorRows = [];
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
function buildSpec() {
    const methodsDir = path.join(__dirname, 'methods');
    const paths = {};

    directorySearch(methodsDir, (configPath) => {
        let config;
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); }
        catch (_e) { return; }

        // Отключённые методы (use:false) не документируем — они отдают 503.
        if (config.use === false) return;

        let url;
        if (typeof config.url === 'string' && config.url.length > 0) {
            url = '/api' + (config.url.startsWith('/') ? config.url : '/' + config.url);
        } else {
            const segments = configPath.replace(/\\/g, '/').split('/');
            const methodsIndex = segments.findIndex(s => s === 'methods');
            const pathParts = segments.slice(methodsIndex + 1, -1); // без config.json
            url = '/api/' + pathParts.join('/');
        }

        if (!paths[url]) paths[url] = {};
        paths[url][config.method || 'get'] = buildPathItem(url, config);
    }, 'config.json', true);

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

// ---- Middleware авторизации для Swagger UI (по SERVICE_KEY) ----
function swaggerAuthMiddleware(req, res, next) {
    // Пропускаем статические ресурсы swagger-ui (CSS, JS, иконки)
    if (req.path !== '/' && req.path !== '' && req.path !== '/index.html') return next();

    const serviceKey = process.env.SERVICE_KEY;
    if (!serviceKey) return res.status(403).json({ error: { code: -5, message: 'Служебный ключ не настроен (SERVICE_KEY)' } });

    const provided = req.headers['x-service-key'] || req.query.key;
    if (!provided || provided !== serviceKey) {
        return res.status(403).send('Доступ запрещён. Используйте /api/docs?key=YOUR_SERVICE_KEY');
    }
    next();
}

/**
 * Регистрирует Swagger UI и экспортирует спецификацию в swagger.json.
 * Включается только при SWAGGER_ENABLED=true. Спека регенерируется при каждом старте.
 * @param {import('express').Application} app
 */
function setupSwagger(app) {
    if (process.env.SWAGGER_ENABLED !== 'true') return;

    // Ленивый require: swagger-ui-express нужен только при включённой документации
    let swaggerUi;
    try { swaggerUi = require('swagger-ui-express'); }
    catch (_e) {
        console.warn('[swagger] SWAGGER_ENABLED=true, но swagger-ui-express не установлен — документация пропущена');
        return;
    }

    const spec = buildSpec();

    // Экспорт спеки в файл (удобно для клиентов/кодогенерации)
    try { fs.writeFileSync(path.join(process.cwd(), 'swagger.json'), JSON.stringify(spec, null, 2)); }
    catch (_e) { /* не критично */ }

    app.use('/api/docs', swaggerAuthMiddleware, swaggerUi.serve, swaggerUi.setup(spec, {
        customSiteTitle: process.env.SWAGGER_TITLE || 'Template Server API',
    }));
}

module.exports = setupSwagger;
// Экспортируем для тестов: проверка, что отключённые методы не попадают в спеку.
module.exports.buildSpec = buildSpec;
