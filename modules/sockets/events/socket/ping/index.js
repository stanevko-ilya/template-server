const Event = require('../../_class');
class Ping extends Event {
    getResponse() { return { ok: true } }
    constructor(event_name, socket) { super(__dirname, event_name, socket) }
}
module.exports = Ping;