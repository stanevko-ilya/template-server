import type { Express } from 'express';
import type { Socket, Server as SocketServer } from 'socket.io';

import { Method, type MethodConfig } from '../../api/methods/_class.js';
import Sockets from '../index.js';

/**
 * Базовый класс socket-события (наследует Method, переопределяя транспорт на socket.io).
 */
export class Event extends Method {
    getEventName(): string {
        return this.getUrl();
    }

    /** Объект сокета (вместо Express-приложения) */
    getSocket(): Socket {
        return this.getExpress() as unknown as Socket;
    }

    /**
     * @param _arg1 Объект сокета (ветка io) или данные события (ветка socket)
     */
    override getResponse(_arg1?: unknown): unknown {
        return true;
    }

    constructor(dirname: string, config: MethodConfig, eventName: string, socket: Socket | SocketServer) {
        super(dirname, config, eventName, socket as unknown as Express);
        this.sendResponse = (socketArg: Socket, data: unknown, error = false): void =>
            Sockets.emit(socketArg, this.getEventName(), !error ? { response: data } : { error: data });
    }

    override createNode(): boolean | void {
        if (!this.getConfig()) return false;
        const socket = this.getSocket();

        socket.on(this.getEventName(), async (data: unknown) => {
            const config = this.getConfig();

            let response: unknown;
            let done: boolean | string = config.use;
            if (!done) return this.sendResponse(socket, this.getError(-3), true);

            if (config.have_params) done = this.checkParams((data ?? {}) as Record<string, unknown>);
            if (done !== true) return this.sendResponse(socket, { ...this.getError(-2), param_name: done }, true);

            try {
                response = await this.getResponse(data);
            } catch {
                done = false;
            }

            if (!done) return this.sendResponse(socket, this.getError(-1), true);
            this.sendResponse(socket, response);
        });
    }
}

export default Event;
