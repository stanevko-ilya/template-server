const Module = require('../../_class');
const API = require('../index');

const modules = require('../../../modules');
const { default: mongoose } = require('mongoose');

class Method extends Module {
    load_config(config_path) {
        return super.load_config(
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
    get_url() { return this.#url }

    /** @type {import('express').Express} */
    #express;
    get_express() { return this.#express }

    /** @type {import('../index').send} */
    send_response() {};

    #errors = [
        { code: -1, message: 'Ошибка во время выполнения запроса' },
        { code: -2, message: 'Ошибка во время проверки параметров запроса' },
        { code: -3, message: 'Метод отключен' },
    ];
    get_error(code) { return this.#errors.find(error => error.code === code) }
    reg_error(code, message) {
        if (this.get_error()) throw new Error('Код ошибки уже занят в данном методе');
        this.#errors.push({ code, message });
    }

    /**
     * 
     * @param {Object} req Запрос пользователя
     * @param {Object} res Ответ пользователю
     * @returns {*} Ответ вызова метода
     */
    async get_response(req, res) { return true }

    check_params(data) {
        const config = this.get_config();
        
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
        }

        return true;
    }

    constructor(__dirname, url, express) {
        super(__dirname);

        this.#url = url;
        this.#express = express;
        this.send_response = API.send;

        this.create_node();
    }

    create_node() {
        if (!this.get_config()) return false;

        this.#express[this.get_config().method](this.get_url(), async (req, res) => {
            const config = this.get_config();

            req.container_data = req[req.method === 'GET' ? 'query' : 'body'];
            if (!req.container_data) req.container_data = {};
            // modules.logger.log('info', `Выполнение запроса ${this.get_url()}`);

            let response;
            let done = config.use;
            if (!done) return this.send_response(res, this.get_error(-3), 500);

            if ('auth' in config) {
                // Проверка авторизации пользователя
            }

            if (config.have_params) done = this.check_params(req.container_data);
            if (done !== true) return this.send_response(res, { ...this.get_error(-2), param_name: done }, 400);
            
            try { response = await this.get_response(req, res) }
            catch (e) { done = false }

            if (!done) return this.send_response(res, this.get_error(-1), 500);
            this.send_response(res, response);
        });
    }
}

module.exports = Method;