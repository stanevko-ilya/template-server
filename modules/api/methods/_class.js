const Module = require('../../_class');

class Method extends Module {
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

    constructor(__dirname, express, send_response) {
        super(__dirname);
        this.#create_node(express, send_response);
    }

    /**
     * 
     * @param {import('express').Express} express 
     * @param {import('../index').send} send_response 
     */
    #create_node(express, send_response) {
        express[this.get_config().method](this.get_config().url, async (req, res) => {
            // TODO: лог о выполнение запроса

            let response;
            let done = true;
            
            try { response = await this.get_response(req, res) }
            catch (e) {
                done = false;
                send_response(res, this.get_error(-1), 500);
            }

            if (!done) return;
            send_response(res, response);
        });
    }
}

module.exports = Method;