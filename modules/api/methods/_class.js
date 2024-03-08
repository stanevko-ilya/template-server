const Module = require('../../_class');
const API = require('../index');

const modules = require('../../../modules');

class Method extends Module {
    load_config(config_path) {
        return super.load_config(
            config_path,
            config => {
                if ('params' in config && config.params instanceof Array && config.params.length > 0) {
                    if (!(new Set(config.params.map(param => param.name)).size === config.params.length)) throw new Error('Имя параметров должны быть уникальные');
                    config.required_params = config.params.filter(param => param.required).map(param => param.name);
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
    get_error(code) { this.#errors.find(error => error.code === code) }
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

    check_params(req) {
        const config = this.get_config();
        
        // Проверка наличия обязательных параметров
        for (let i = 0; i < config.required_params.length; i++) {
            const key = config.required_params[i];
            if (!(key in req.container_data)) return false;
        }

        // Обработка переданных параметров
        for (const key in req.container_data) {
            const param_config = config.params.find(param => param.name === key);
            if (!param_config) {
                delete req.container_data[key];
                continue;
            }

            // TODO: Обработка и проверка значения
        }
    }

    constructor(__dirname, url, express) {
        super(__dirname);

        this.#url = url;
        this.#express = express;
        this.send_response = API.send;

        this.#create_node();
    }

    #create_node() {
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

            if (config.have_params) done = this.check_params(req);

            if (!done) return this.send_response(res, this.get_error(-2), 400);
            
            try { response = await this.get_response(req, res) }
            catch (e) { done = false }

            if (!done) return this.send_response(res, this.get_error(-1), 500);
            this.send_response(res, response);
        });
    }
}

module.exports = Method;