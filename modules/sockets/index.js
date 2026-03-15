const path = require('path');
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
        // SSL-credentials из модуля ssl
        const options = modules.ssl?.getCredentials();
        const mode_https = !!options;

        this.#server = (mode_https ? https : http).createServer(options ? options : {});
        this.#initSocket();
        this.initEvents(this.getSocket(), 'io');

        await new Promise((res) => {
            const port = Number(this.getConfig().port) || 444;
            this.#server.listen(port, () => {
                modules.logger.log('info', `Socket сервер на ${mode_https ? 'HTTPS' : 'HTTP'} запущен, порт: ${port}`);
                res(true);
            })
        });
    }

    async stopFunction() {
        await new Promise((res) =>
            this.#server.close(() => {
                modules.logger.log('info', 'Socket сервер остановлен');
                res(true);
            })
        );
    }

    constructor() { super(__dirname) }
}

module.exports = Sockets;