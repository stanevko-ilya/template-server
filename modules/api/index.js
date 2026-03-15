const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const Module = require('../_class');
const directorySearch = require('../../functions/directorySearch');

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

const modules = require('../../modules');

class API extends Module {
    /**
     * 
     * @param {*} res res
     * @param {Object|String} data Ответ, который необхоимо вывести
     * @param {Number} code Код ответа
     * @description Возвращает ответ пользователю на API запрос
     */
    static send(res, data, code=200) { res.status(code).send(code < 400 ? { response: data } : { error: data }) }

    /** @type {express.Express} */
    #express;
    #initExpress() {
        this.#express = express();

        // Security middleware
        this.#express.use(helmet());
        this.#express.use(cors(this.getConfig().cors || {}));

        // Rate limiting
        const rateLimitConfig = this.getConfig().rateLimit || {};
        this.#express.use(rateLimit({
            windowMs: rateLimitConfig.windowMs || 15 * 60 * 1000,
            max: rateLimitConfig.max || 100,
            standardHeaders: true,
            legacyHeaders: false,
        }));

        // Static files
        this.#express.use('/', express.static(path.join(this.getDirname(), this.getConfig().paths.static)));

        // Custom headers
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

        // Body parsing
        this.#express.use(express.json());
        this.#express.use(express.urlencoded({ extended: false }));

        // NoSQL injection protection (Express 5: req.query read-only, sanitизируем только body)
        this.#express.use((req, _res, next) => {
            if (req.body) req.body = sanitize(req.body);
            next();
        });

        // Request logging
        this.#express.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                modules.logger?.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
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
                const method = new (require(file_path))('/' + this.getConfig().sub_url + '/' + splited.slice(splited.findIndex(e => e === this.getConfig().paths.methods.split('/').reverse()[0]) + 1, splited.length - 1).join('/'), this.#express);
            },
            'index.js'
        );
    }

    /** @type {http.Server|https.Server} */
    #server;

    async startFunction() {
        this.#initExpress();
        this.#initMethod();

        // SSL-credentials из модуля ssl
        const options = modules.ssl?.getCredentials();
        const mode_https = !!options;

        this.#server = (mode_https ? https : http).createServer(options ? options : {}, this.#express);

        await new Promise((res) => {
            const port = Number(this.getConfig().port) || 443;
            this.#server.listen(port, () => {
                modules.logger.log('info', `${mode_https ? 'HTTPS' : 'HTTP'} сервер запущен, порт: ${port}`);
                res(true);
            })
        });
    }

    async stopFunction() {
        await new Promise((res) =>
            this.#server.close(() => {
                modules.logger.log('info', 'Сервер остановлен');
                res(true);
            })
        );
    }

    // Передача _dirname, так как класс API используется для класса Socket
    constructor(_dirname=__dirname) { super(_dirname) }
}

module.exports = API;
