import type { Socket, Server as SocketServer } from 'socket.io';

import modules from '../../../../../modules.js';
import { Event } from '../../_class.js';
import config from './config.js';

export class Connection extends Event {
    override async getResponse(socket: Socket): Promise<{ connected: true }> {
        // Инициализация событий из ветки "socket" для нового подключённого сокета
        await modules.sockets?.initEvents(socket, 'socket');
        return { connected: true };
    }

    constructor(eventName: string, socket: Socket | SocketServer) {
        super(import.meta.dirname, config, eventName, socket);
    }
}

export default Connection;
