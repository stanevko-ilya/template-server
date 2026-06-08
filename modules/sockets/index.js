const path = require('path');
const http = require('http');
const socket_io = require('socket.io');
const jwt = require('jsonwebtoken');

const modules = require('../../modules');
const API = require('../api');
const directorySearch = require('../../functions/directorySearch');
const { getJwtSecret, warnNoJwtSecretOnce } = require('../../functions/jwtSecret');

/**
 * @description Socket.IO сервер.
 * TLS терминируется внешним nginx — слушаем plain HTTP. Поддержка CORS, опционального
 * JWT-хендшейка (config.auth) и Redis-adapter (для мультиреплики поверх modules.cache).
 */
class Sockets extends API {
    /**
     * @param {socket_io.Socket} socket socket
     * @param {String} event Название события
     * @param {Object|String} data Данные, которые необходимо отправить
     */
    static send(socket, event, data) { socket.emit(event, data) }

    /** @type {socket_io.Server} */
    #socket;
    getSocket() { return this.#socket }

    /** @type {Array<import('ioredis').Redis>} */
    #adapterClients = [];

    #initSocket() {
        this.#socket = new socket_io.Server(this.#server, {
            cors: this.getConfig().cors || { origin: '*' },
        });

        // JWT-хендшейк (если включён config.auth): токен из handshake.auth.token или query.token
        if (this.getConfig().auth) {
            warnNoJwtSecretOnce(modules.logger);
            this.#socket.use((socket, next) => {
                const token = socket.handshake.auth?.token || socket.handshake.query?.token;
                if (!token) return next(new Error('Необходима авторизация'));
                try {
                    socket.data.user = jwt.verify(String(token), getJwtSecret());
                    next();
                } catch (_e) {
                    next(new Error('Невалидный токен'));
                }
            });
        }
    }

    initEvents(socket, socket_mode) {
        directorySearch(
            path.join(this.getDirname(), this.getConfig().paths.events, socket_mode),
            file_path => {
                const splited = file_path.replace(/\\/g, '/').split('/');
                /** @type {import('./events/_class')} */
                new (require(file_path))(splited.slice(splited.findIndex(e => e === this.getConfig().paths.events.split('/').reverse()[0]) + 2, splited.length - 1).join('/'), socket);
            },
            'index.js'
        );
    }

    /** @type {http.Server} */
    #server;

    /**
     * @description Подключает Redis-adapter для мультиреплики (события доходят между инстансами).
     * Клиенты создаются СВЯЗАННЫМИ и с offline-очередью, чтобы подписка не падала.
     * Любая ошибка — некритична (single-node fallback).
     */
    async #setupRedisAdapter() {
        const client = modules.cache?.client;
        if (!client || client.status !== 'ready') return;

        try {
            const { createAdapter } = require('@socket.io/redis-adapter');
            const overrides = { lazyConnect: false, enableOfflineQueue: true };
            const pubClient = client.duplicate(overrides);
            const subClient = client.duplicate(overrides);
            pubClient.on('error', () => {});
            subClient.on('error', () => {});
            if (pubClient.status === 'wait') await pubClient.connect();
            if (subClient.status === 'wait') await subClient.connect();

            this.#adapterClients = [pubClient, subClient];
            this.#socket.adapter(createAdapter(pubClient, subClient));
            modules.logger?.info('[sockets] Redis-adapter подключён (мультиреплика)');
        } catch (e) {
            modules.logger?.warn('[sockets] Redis-adapter недоступен (' + e.message + ') — режим single-node');
            for (const c of this.#adapterClients) { try { c.disconnect(); } catch (_e) { /* ignore */ } }
            this.#adapterClients = [];
        }
    }

    async startFunction() {
        this.#server = http.createServer();
        this.#initSocket();
        await this.#setupRedisAdapter();
        this.initEvents(this.getSocket(), 'io');

        await new Promise((res) => {
            const port = Number(this.getConfig().port) || 3001;
            this.#server.listen(port, () => {
                modules.logger.log('info', `Socket сервер запущен, порт: ${port}`);
                res(true);
            });
        });
    }

    async stopFunction() {
        // Graceful drain: io.close() закрывает приём, отключает клиентов и сам HTTP-сервер
        await new Promise((resolve) => {
            if (!this.#socket) return resolve();
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            this.#socket.close(finish);
            setTimeout(finish, 3000); // форс-таймаут на «зависшие» соединения
        });

        // Грейсфул-закрытие pub/sub клиентов адаптера (quit ждёт pending-команды → нет "Connection is closed")
        for (const c of this.#adapterClients) { try { await c.quit(); } catch (_e) { /* ignore */ } }
        this.#adapterClients = [];

        modules.logger?.log('info', 'Socket сервер остановлен');
    }

    constructor() { super(__dirname) }
}

module.exports = Sockets;
