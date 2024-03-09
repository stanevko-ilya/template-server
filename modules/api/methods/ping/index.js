const Method = require('../_class');

class Ping extends Method {
    get_response(req) { return ({ ok: true, ...req.container_data }) }

    constructor(url, express) { super(__dirname, url, express) }
}

module.exports = Ping;