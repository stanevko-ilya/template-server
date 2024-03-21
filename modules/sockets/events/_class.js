const Method = require('../../api/methods/_class');
const Sockets = require('../index');

class Event extends Method {
    // Переименовывание методов

    get_event_name() { return this.get_url() }

    /** @returns {import('socket.io').Socket} */
    get_socket() { return this.get_express() }

    /**
     * 
     * @param {import('socket.io').Socket|Object} arg1 Объект сокета, если запрос проходит через ветку io или объект с передаваемыми данными, если запроходит через ветку socket
     */
    get_response(arg1) { return true }

    constructor(__dirname, event_name, socket) {
        super(__dirname, event_name, socket);
        this.send_response = (socket, data, error=false) => Sockets.send(socket, this.get_event_name(), !error ? { response: data } : { error: data });
    }

    create_node() {
        if (!this.get_config()) return false;
        const socket = this.get_socket();

        this.get_socket().on(this.get_event_name(), async data => {
            const config = this.get_config();

            let response;
            let done = config.use;
            if (!done) return this.send_response(res, this.get_error(-3), true);

            if (config.have_params) done = this.check_params(data);
            if (done !== true) return this.send_response(socket, { ...this.get_error(-2), param_name: done }, true);
            
            try { response = await this.get_response(data) }
            catch (e) { done = false }

            if (!done) return this.send_response(socket, this.get_error(-1), true);
            this.send_response(socket, response);
        });
    }
}

module.exports = Event;