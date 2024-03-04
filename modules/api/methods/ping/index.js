const Method = require('../_class');

class Ping extends Method {
    get_response() { return ({ ok: true }) }

    constructor(url, express) { super(__dirname, url, express) }
}

module.exports = Ping;