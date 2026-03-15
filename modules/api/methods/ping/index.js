const Method = require('../_class');

class Ping extends Method {
    getResponse() { return ({ ok: true }) }

    getTest() {
        return {
            request: {},
            expect: { status: 200, body: { ok: true } }
        };
    }

    constructor(url, express) { super(__dirname, url, express) }
}

module.exports = Ping;