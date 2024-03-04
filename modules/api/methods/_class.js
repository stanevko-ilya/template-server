const Module = require('../../_class');
const API = require('../index');

class Method extends Module {
    /** @type {String} */
    #url;
    get_url() { return this.#url }

    /** @type {import('express').Express} */
    #express;
    get_express() { return this.#express }

    /** @type {import('../index').send} */
    send_response() {};

    #errors = [
        { code: -1, message: 'Ошибка во время выполнения запроса' }
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

    constructor(__dirname, url, express) {
        super(__dirname);

        this.#url = url;
        this.#express = express;
        this.send_response = API.send;

        this.#create_node();
    }

    #create_node() {
        this.#express[this.get_config().method](this.#url, async (req, res) => {
            // TODO: лог о выполнение запроса

            let response;
            let done = true;
            
            try { response = await this.get_response(req, res) }
            catch (e) {
                done = false;
                this.send_response(res, this.get_error(-1), 500);
            }

            if (!done) return;
            this.send_response(res, response);
        });
    }
}

module.exports = Method;