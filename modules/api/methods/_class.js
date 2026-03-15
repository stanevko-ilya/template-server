const Module = require('../../_class');
const API = require('../index');
const jwt = require('jsonwebtoken');

const modules = require('../../../modules');
const { default: mongoose } = require('mongoose');

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
     * 
     * @param {Object} req Запрос пользователя
     * @param {Object} res Ответ пользователю
     * @returns {*} Ответ вызова метода
     */
    async getResponse(req, res) { return true }

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
             *  type: 'string'|'number'|'object'|'boolean'|'objectId',
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
                }
            } catch (e) { return key }

            
            if ('valid_values' in param_config && param_config.valid_values.indexOf(value) === -1) return key; 
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

        this.#express[this.getConfig().method](this.getUrl(), async (req, res) => {
            const config = this.getConfig();

            req.container_data = req[req.method === 'GET' ? 'query' : 'body'];
            if (!req.container_data) req.container_data = {};
            // modules.logger.log('info', `Выполнение запроса ${this.getUrl()}`);

            let response;
            let done = config.use;
            if (!done) return this.sendResponse(res, this.getError(-3), 500);

            if ('auth' in config) {
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return this.sendResponse(res, this.getError(-4), 401);
                }

                const token = authHeader.slice(7);
                try {
                    const secret = process.env.JWT_SECRET || 'default-secret';
                    req.user = jwt.verify(token, secret);

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
            catch (e) { done = false }

            if (!done) return this.sendResponse(res, this.getError(-1), 500);
            
            if (response instanceof Object && 'error_code' in response) return this.sendResponse(res, this.getError(response.error_code), 'status' in response ? response.status : 200);
            this.sendResponse(res, response);
        });
    }
}

module.exports = Method;
