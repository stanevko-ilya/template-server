const Method = require('../../api/methods/_class');
const Sockets = require('../index');

class Event extends Method {
    // Переименовывание методов

    getEventName() { return this.getUrl() }

    /** @returns {import('socket.io').Socket} */
    getSocket() { return this.getExpress() }

    /**
     * 
     * @param {import('socket.io').Socket|Object} arg1 Объект сокета, если запрос проходит через ветку io или объект с передаваемыми данными, если запроходит через ветку socket
     */
    getResponse(arg1) { return true }

    constructor(__dirname, event_name, socket) {
        super(__dirname, event_name, socket);
        this.sendResponse = (socket, data, error=false) => Sockets.send(socket, this.getEventName(), !error ? { response: data } : { error: data });
    }

    createNode() {
        if (!this.getConfig()) return false;
        const socket = this.getSocket();

        this.getSocket().on(this.getEventName(), async data => {
            const config = this.getConfig();

            let response;
            let done = config.use;
            if (!done) return this.sendResponse(socket, this.getError(-3), true);

            if (config.have_params) done = this.checkParams(data);
            if (done !== true) return this.sendResponse(socket, { ...this.getError(-2), param_name: done }, true);
            
            try { response = await this.getResponse(data) }
            catch (e) { done = false }

            if (!done) return this.sendResponse(socket, this.getError(-1), true);
            this.sendResponse(socket, response);
        });
    }
}

module.exports = Event;