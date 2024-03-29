const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const body_parser = require('body-parser');

const Module = require('../_class');
const directory_search = require('../../functions/directory_search');

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

    /** @type {{ key: String, cert: String, ca: String }} */
    #options;
    get_options() { return this.#options }
    load_options() {
        try {
            const SSL_PATH = path.join(this.get_dirname(), this.get_config().paths.ssl);
            this.#options = {
                key: fs.readFileSync(path.join(SSL_PATH, 'key.key')), 
                cert: fs.readFileSync(path.join(SSL_PATH, 'certificate.crt')), 
                ca: fs.readFileSync(path.join(SSL_PATH, 'domain.cabundle'))
            }
        } catch (e) {
            modules.logger.log('warn', e.message);
        }
    }
    
    /** @type {express.Express} */
    #express;
    #init_express() {
        this.#express = express();
        this.#express.use('/', express.static(path.join(this.get_dirname(), this.get_config().paths.static)));
        
        const headers = this.get_config().headers;
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

        this.#express.use(body_parser.json());
        this.#express.use(body_parser.urlencoded({ extended: false }));

        //Дополнительные обработчики
    }
    
    #init_methods() {
        directory_search(
            path.join(this.get_dirname(), this.get_config().paths.methods),
            file_path => {
                const splited = file_path.replace(/\\/g, '/').split('/');
                /** @type {import('./methods/_class')} */
                const method = new (require(file_path))('/' + this.get_config().sub_url + '/' + splited.slice(splited.findIndex(e => e === this.get_config().paths.methods.split('/').reverse()[0]) + 1, splited.length - 1).join('/'), this.#express);
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

        if (!this.get_options() && mode_https) this.load_options();
        const options = this.get_options();
        
        this.#server = (mode_https ? https : http).createServer(options ? options : {}, this.#express);
        
        await new Promise((res) => {
            const port = this.get_config().port;
            this.#server.listen(port, () => {
                modules.logger.log('info', `${mode_https ? 'HTTPS' : 'HTTP'} сервер запрущен, порт: ${port}`);
                res(true);
            })
        });
    }
    
    async stop_function() {
        await new Promise((res) =>
            this.#server.close(() => {
                modules.logger.log('info', `${this.get_config().https ? 'HTTPS' : 'HTTP'} сервер остановлен`);
                res(true);
            })
        );
    }

    // Передача _dirname, так как класс API используется для класса Socket
    constructor(_dirname=__dirname) { super(_dirname) }
}

module.exports = API;
