const express = require('express');
const jwt = require('jsonwebtoken');
const { default: mongoose } = require('mongoose');

const Module = require('../../_class');
const API = require('../index');
const apiConfig = require('../config.json');
const getUserRateLimit = require('../middleware/userRateLimit');
const { getJwtSecret, warnNoJwtSecretOnce } = require('../../../functions/jwtSecret');
const modules = require('../../../modules');

class Method extends Module {
    loadConfig(config_path) {
        return super.loadConfig(
            config_path,
            config => {
                if ('params' in config && config.params instanceof Array && config.params.length > 0) {
                    if (!(new Set(config.params.map(param => param.name)).size === config.params.length)) throw new Error('Имя параметров должны быть уникальные');
                    config.required_params = config.params.filter(param => param.required).map(param => param.name);
                    config.have_params = true;
                }
                return config;
            }
        );
    }

    /** @type {String} */
    #url;
    getUrl() { return this.#url }

    /** @type {import('express').Express} */
    #express;
    getExpress() { return this.#express }

    /** @type {import('../index').send} */
    sendResponse() {};

    #errors = [
        { code: -1, message: 'Ошибка во время выполнения запроса' },
        { code: -2, message: 'Ошибка во время проверки параметров запроса' },
        { code: -3, message: 'Метод отключен' },
        { code: -4, message: 'Необходима авторизация' },
        { code: -5, message: 'Недостаточно прав' },
    ];
    getError(code) { return this.#errors.find(error => error.code === code) }
    regError(code, message) {
        if (this.getError(code)) throw new Error('Код ошибки уже занят в данном методе');
        this.#errors.push({ code, message });
    }

    /**
     * @param {Object} req Запрос пользователя
     * @param {Object} res Ответ пользователю
     * @returns {*} Ответ вызова метода
     */
    async getResponse(_req, _res) { return true }

    /**
     * Возвращает конфигурацию теста для данного метода, или null если тест не определён.
     * @returns {{ request: { params?: Object, headers?: Object }, expect: { status: number, body: *|Function } } | null}
     */
    getTest() { return null }

    checkParams(data) {
        const config = this.getConfig();

        // Проверка наличия обязательных параметров
        for (let i = 0; i < config.required_params.length; i++) {
            const key = config.required_params[i];
            if (!(key in data)) return key;
        }

        // Обработка переданных параметров
        for (const key in data) {
            /**
             * @type {{
             *  name: String,
             *  required: Boolean,
             *  type: 'string'|'number'|'object'|'boolean'|'objectId'|'array',
             *  orientation: 'positive'|'negative',
             *  interval: [Number, Number],
             *  valid_values: Array<*>
             * }|undefined}
             */
            const param_config = config.params.find(param => param.name === key);
            if (!param_config) {
                delete data[key];
                continue;
            }

            // Обработка и проверка значения
            let value = data[key];
            try {
                switch (param_config.type) {
                    case 'number':
                        value = +value;

                        if (
                            'orientation' in param_config
                            &&
                            (param_config.orientation === 'positive' && value < 0 || param_config.orientation === 'negative' && value > 0)
                        ) value *= -1;

                        if ('interval' in param_config && (param_config.interval[0] >= value || param_config.interval[1] <= value)) return key;
                        break;

                    case 'boolean':
                        value = Boolean(Number.parseInt(value));
                        break;

                    case 'object':
                        value = JSON.parse(value);
                        break;

                    case 'objectId':
                        value = new mongoose.Types.ObjectId(value);
                        break;

                    case 'array':
                        if (typeof value === 'string') value = JSON.parse(value);
                        if (!Array.isArray(value)) return key;
                        break;
                }
            } catch (_e) { return key }

            if ('valid_values' in param_config && param_config.valid_values.indexOf(value) === -1) return key;

            data[key] = value;
        }

        return true;
    }

    constructor(__dirname, url, express) {
        super(__dirname);

        this.#url = url;
        this.#express = express;
        this.sendResponse = API.send;

        const method_config = this.getConfig();
        if (method_config) {
            if (method_config.auth) warnNoJwtSecretOnce(modules.logger);
            if ('errors' in method_config && method_config.errors instanceof Array) {
                for (let i = 0; i < method_config.errors.length; i++) {
                    const error = method_config.errors[i];
                    if ('code' in error && 'message' in error) this.regError(error.code, error.message);
                }
            }
        }

        this.createNode();
    }

    createNode() {
        if (!this.getConfig()) return false;

        const config = this.getConfig();
        const middlewares = [];

        // Per-route body-парсер: лимит из config.bodyLimit метода, иначе глобальный apiConfig.bodyLimit,
        // иначе 512kb. В TEST_MODE всегда 50mb (нагрузочные тесты). + NoSQL-санитайз тела.
        if (config.method !== 'get') {
            const bodyLimit = process.env.TEST_MODE === 'true'
                ? '50mb'
                : (config.bodyLimit || apiConfig.bodyLimit || '512kb');
            middlewares.push(express.json({ limit: bodyLimit }));
            middlewares.push(express.urlencoded({ extended: false, limit: bodyLimit }));
            middlewares.push((req, _res, next) => { if (req.body) req.body = API.sanitize(req.body); next(); });
        }

        // Per-user rate limit для авторизованных эндпоинтов
        if (config.auth) {
            middlewares.push(getUserRateLimit(apiConfig.userRateLimit));
        }

        this.getExpress()[config.method](this.getUrl(), ...middlewares, async (req, res) => {
            req.container_data = req[req.method === 'GET' ? 'query' : 'body'];
            if (!req.container_data) req.container_data = {};

            let response;
            let done = config.use;
            if (!done) return this.sendResponse(res, this.getError(-3), 503);

            if (config.auth) {
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return this.sendResponse(res, this.getError(-4), 401);
                }

                const token = authHeader.slice(7);
                try {
                    req.user = jwt.verify(token, getJwtSecret());

                    // Проверка ролей
                    if (config.auth.roles && config.auth.roles.length > 0) {
                        const userRole = req.user.role || '';
                        if (!config.auth.roles.includes(userRole)) {
                            return this.sendResponse(res, this.getError(-5), 403);
                        }
                    }
                } catch (_e) {
                    return this.sendResponse(res, this.getError(-4), 401);
                }
            }

            if (config.have_params) done = this.checkParams(req.container_data);
            if (done !== true) return this.sendResponse(res, { ...this.getError(-2), param_name: done }, 400);

            try { response = await this.getResponse(req, res) }
            catch (e) {
                done = false;
                modules.logger?.error(`Ошибка в методе ${this.getUrl()}: ${e.message}`, null, { requestId: req.requestId });
                modules.logger?.error(e.stack || '', null, { requestId: req.requestId });
            }

            if (!done) return this.sendResponse(res, this.getError(-1), 500);
            if (res.headersSent) return;

            if (response instanceof Object && 'error_code' in response) return this.sendResponse(res, this.getError(response.error_code), 'status' in response ? response.status : 200);
            this.sendResponse(res, response);
        });
    }
}

module.exports = Method;
