const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');

const Module = require('../_class');
const directory_search = require('../../functions/directory_search');

class API extends Module {
    /**
     * 
     * @param {*} res res
     * @param {Object|String} data Ответ, который необхоимо вывести
     * @param {Number} code Код ответа
     * @description Возвращает ответ пользователю на API запрос
     */
    static send(res, data, code=200) { res.status(code).send(code < 400 ? { response: data } : { error: data }) }

    /** @type {{ key: String, cert: String, ca: String }} */
    #options;
    get_options() { return this.#options }
    load_options() {
        try {
            const SSL_PATH = this.get_config().path.ssl;
            this.#options = {
                key: fs.readFileSync(path.join(SSL_PATH, 'key.key')), 
                cert: fs.readFileSync(path.join(SSL_PATH, 'certificate.crt')), 
                ca: fs.readFileSync(path.join(SSL_PATH, 'domain.cabundle'))
            }
        } catch (e) {
            // TODO: лог об ошибке загрузки
        }
    }
    
    /** @type {express.Express} */
    #express;
    #init_express() {
        this.#express = express();
        this.#express.use('/', express.static(path.join(this.get_dirname(), this.get_config().path.static)));
    }
    
    #init_methods() {
        directory_search(
            path.join(this.get_dirname(), this.get_config().path.methods),
            file_path => {
                /** @type {import('./methods/_class')} */
                const method = new (require(file_path))(file_path, this.#express, API.send);
                
            },
            'index.js'
        );
    }

    /** @type {http.Server|https.Server} */
    #server;

    async start_function() {
        this.#init_express();
        this.#init_methods();

        const mode_https = this.get_config().https;
        const options = this.get_options();
        this.#server = (mode_https ? https : http).createServer(options ? options : {}, this.#express);
        
        await new Promise((res) =>
            this.#server.listen(this.get_config().port, () => {
                // TODO: лог о запуске сервера
                res(true);
            })
        );
    }
    
    async stop_function() {
        await new Promise((res) =>
            this.#server.close(() => {
                // TODO: лог об остановке сервера
                res(true);
            })
        );
    }

    constructor() { super(__dirname) }
}

module.exports = API;