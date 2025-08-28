const modules = require('../../../../../modules');
const Event = require('../../_class');

class Connection extends Event {
    getResponse(socket) {
        modules.sockets.initEvents(socket, 'socket'); // Инициализация событий из ветки "socket" для нового подключенного сокета
        return { connected: true };
    }

    constructor(event_name, socket) { super(__dirname, event_name, socket) }
}

module.exports = Connection;