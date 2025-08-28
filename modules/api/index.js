const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const body_parser = require('body-parser');

const Module = require('../_class');
const directorySearch = require('../../functions/directorySearch');

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
    getOptions() { return this.#options }
    loadOptions() {
        try {
            const SSL_PATH = path.join(this.getDirname(), this.getConfig().paths.ssl);
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
    #initExpress() {
        this.#express = express();
        this.#express.use('/', express.static(path.join(this.getDirname(), this.getConfig().paths.static)));
        
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

        this.#express.use(body_parser.json());
        this.#express.use(body_parser.urlencoded({ extended: false }));

        //Дополнительные обработчики
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

        const mode_https = this.getConfig().https;

        if (!this.getOptions() && mode_https) this.loadOptions();
        const options = this.getOptions();
        
        this.#server = (mode_https ? https : http).createServer(options ? options : {}, this.#express);
        
        await new Promise((res) => {
            const port = this.getConfig().port;
            this.#server.listen(port, () => {
                modules.logger.log('info', `${mode_https ? 'HTTPS' : 'HTTP'} сервер запрущен, порт: ${port}`);
                res(true);
            })
        });
    }
    
    async stopFunction() {
        await new Promise((res) =>
            this.#server.close(() => {
                modules.logger.log('info', `${this.getConfig().https ? 'HTTPS' : 'HTTP'} сервер остановлен`);
                res(true);
            })
        );
    }

    // Передача _dirname, так как класс API используется для класса Socket
    constructor(_dirname=__dirname) { super(_dirname) }
}

module.exports = API;
