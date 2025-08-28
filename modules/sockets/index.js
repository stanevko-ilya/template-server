const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const socket_io = require('socket.io');

const modules = require('../../modules');
const API = require('../api');
const directorySearch = require('../../functions/directorySearch');

class Sockets extends API {
    /**
     * 
     * @param {socket_io.Socket} socket socket
     * @param {String} event Название события 
     * @param {Object|String} data Данные, которые необходимо отправить
     * @description Обработчик для отправки данных
     */
    static send(socket, event, data) { socket.emit(event, data) }

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

    /** @type {socket_io.Server} */
    #socket;
    getSocket() { return this.#socket }

    #initSocket() { this.#socket = new socket_io.Server(this.#server, {  }) }

    initEvents(socket, socket_mode) {
        directorySearch(
            path.join(this.getDirname(), this.getConfig().paths.events, socket_mode),
            file_path => {
                const splited = file_path.replace(/\\/g, '/').split('/');
                /** @type {import('./events/_class')} `*/
                const event = new (require(file_path))(splited.slice(splited.findIndex(e => e === this.getConfig().paths.events.split('/').reverse()[0]) + 2, splited.length - 1).join('/'), socket);
            },
            'index.js'
        );
    }

    /** @type {http.Server|https.Server} */
    #server;

    async startFunction() {
        const mode_https = this.getConfig().https;

        if (!this.getOptions() && mode_https) this.loadOptions();
        const options = this.getOptions();
         
        this.#server = (mode_https ? https : http).createServer(options ? options : {});
        this.#initSocket();
        this.initEvents(this.getSocket(), 'io');

        await new Promise((res) => {
            const port = this.getConfig().port;
            this.#server.listen(port, () => {
                modules.logger.log('info', `Socket сервер на ${mode_https ? 'HTTPS' : 'HTTP'} сервере запрущен, порт: ${port}`);
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
 
    constructor() { super(__dirname) }
}

module.exports = Sockets;