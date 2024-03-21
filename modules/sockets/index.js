const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const socket_io = require('socket.io');

const modules = require('../../modules');
const API = require('../api');
const directory_search = require('../../functions/directory_search');

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

    /** @type {socket_io.Server} */
    #socket;
    get_socket() { return this.#socket }

    #init_socket() { this.#socket = new socket_io.Server(this.#server, {  }) }

    init_events(socket, socket_mode) {
        directory_search(
            path.join(this.get_dirname(), this.get_config().paths.events, socket_mode),
            file_path => {
                const splited = file_path.replace(/\\/g, '/').split('/');
                /** @type {import('./events/_class')} `*/
                const event = new (require(file_path))(splited.slice(splited.findIndex(e => e === this.get_config().paths.events.split('/').reverse()[0]) + 2, splited.length - 1).join('/'), socket);
            },
            'index.js'
        );
    }

    /** @type {http.Server|https.Server} */
    #server;

    async start_function() {
        const mode_https = this.get_config().https;

        if (!this.get_options() && mode_https) this.load_options();
        const options = this.get_options();
         
        this.#server = (mode_https ? https : http).createServer(options ? options : {});
        this.#init_socket();
        this.init_events(this.get_socket(), 'io');

        await new Promise((res) => {
            const port = this.get_config().port;
            this.#server.listen(port, () => {
                modules.logger.log('info', `Socket сервер на ${mode_https ? 'HTTPS' : 'HTTP'} сервере запрущен, порт: ${port}`);
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
 
    constructor() { super(__dirname) }
}

module.exports = Sockets;