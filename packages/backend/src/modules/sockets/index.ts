import http from 'node:http';
import path from 'node:path';
import { Server as SocketServer, type Socket } from 'socket.io';
import type { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';

import modules from '../../modules.js';
import API from '../api/index.js';
import directorySearch from '../../functions/directorySearch.js';
import { runtimeExt, importDefault } from '../../functions/importModule.js';
import { getJwtSecret, warnNoJwtSecretOnce } from '../../functions/jwtSecret.js';
import config, { type SocketsConfig } from './config.js';

/**
 * Socket.IO сервер. TLS терминируется внешним nginx — слушаем plain HTTP.
 * Поддержка CORS, опционального JWT-хендшейка (config.auth) и Redis-adapter
 * (для мультиреплики поверх modules.cache).
 */
export class Sockets extends API<SocketsConfig> {
    /** Отправляет данные клиенту по событию (раньше — статический Sockets.send) */
    static emit(socket: Socket, event: string, data: unknown): void {
        socket.emit(event, data);
    }

    #socket!: SocketServer;
    getSocket(): SocketServer {
        return this.#socket;
    }

    #adapterClients: Redis[] = [];
    #httpServer!: http.Server;

    constructor() {
        super(import.meta.dirname, config);
    }

    #initSocket(): void {
        const cfg = this.getConfig();
        this.#socket = new SocketServer(this.#httpServer, {
            cors: cfg.cors || { origin: '*' },
        });

        // JWT-хендшейк (если включён config.auth): токен из handshake.auth.token или query.token
        if (cfg.auth) {
            warnNoJwtSecretOnce(modules.logger);
            this.#socket.use((socket, next) => {
                const token = socket.handshake.auth?.token || socket.handshake.query?.token;
                if (!token) return next(new Error('Необходима авторизация'));
                try {
                    socket.data.user = jwt.verify(String(token), getJwtSecret());
                    next();
                } catch {
                    next(new Error('Невалидный токен'));
                }
            });
        }
    }

    async initEvents(socket: SocketServer | Socket, socketMode: string): Promise<void> {
        const cfg = this.getConfig();
        const ext = runtimeExt(import.meta.filename);
        const eventsRoot = path.join(this.getDirname(), cfg.paths.events, socketMode);
        const eventsToken = cfg.paths.events.split('/').reverse()[0];

        const files = directorySearch(eventsRoot, `index${ext}`, false);
        for (const file of files) {
            const splited = file.replace(/\\/g, '/').split('/');
            const eventName = splited
                .slice(splited.findIndex((e) => e === eventsToken) + 2, splited.length - 1)
                .join('/');

            const EventClass =
                await importDefault<new (eventName: string, socket: SocketServer | Socket) => unknown>(file);
            new EventClass(eventName, socket);
        }
    }

    /**
     * Подключает Redis-adapter для мультиреплики (события доходят между инстансами).
     * Клиенты создаются СВЯЗАННЫМИ и с offline-очередью, чтобы подписка не падала.
     * Любая ошибка — некритична (single-node fallback).
     */
    async #setupRedisAdapter(): Promise<void> {
        const client = modules.cache?.client;
        if (!client || client.status !== 'ready') return;

        try {
            const { createAdapter } = await import('@socket.io/redis-adapter');
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
            modules.logger?.warn(
                '[sockets] Redis-adapter недоступен (' + (e as Error).message + ') — режим single-node',
            );
            for (const c of this.#adapterClients) {
                try {
                    c.disconnect();
                } catch {
                    /* ignore */
                }
            }
            this.#adapterClients = [];
        }
    }

    protected async startFunction(): Promise<void> {
        this.#httpServer = http.createServer();
        this.#initSocket();
        await this.#setupRedisAdapter();
        await this.initEvents(this.getSocket(), 'io');

        await new Promise<void>((resolve) => {
            const port = Number(this.getConfig().port) || 3001;
            this.#httpServer.listen(port, () => {
                modules.logger?.log('info', `Socket сервер запущен, порт: ${port}`);
                resolve();
            });
        });
    }

    protected async stopFunction(): Promise<void> {
        // Graceful drain: io.close() закрывает приём, отключает клиентов и сам HTTP-сервер
        await new Promise<void>((resolve) => {
            if (!this.#socket) return resolve();
            let done = false;
            const finish = (): void => {
                if (!done) {
                    done = true;
                    resolve();
                }
            };
            this.#socket.close(finish);
            setTimeout(finish, 3000); // форс-таймаут на «зависшие» соединения
        });

        // Грейсфул-закрытие pub/sub клиентов адаптера
        for (const c of this.#adapterClients) {
            try {
                await c.quit();
            } catch {
                /* ignore */
            }
        }
        this.#adapterClients = [];

        modules.logger?.log('info', 'Socket сервер остановлен');
    }
}

export default Sockets;
