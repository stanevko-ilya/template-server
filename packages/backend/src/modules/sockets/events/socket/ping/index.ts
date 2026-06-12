import type { Socket, Server as SocketServer } from 'socket.io';

import { Event } from '../../_class.js';
import config from './config.js';

export class Ping extends Event {
    override getResponse(): { ok: true } {
        return { ok: true };
    }

    constructor(eventName: string, socket: Socket | SocketServer) {
        super(import.meta.dirname, config, eventName, socket);
    }
}

export default Ping;
