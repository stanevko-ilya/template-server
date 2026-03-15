const Method = require('../_class');
const modules = require('../../../../modules');

class Health extends Method {
    getResponse() {
        const statuses = {};
        for (const name in modules) {
            statuses[name] = modules[name].getStatus();
        }

        return {
            status: 'ok',
            ...statuses
        };
    }

    constructor(url, express) { super(__dirname, url, express) }
}

module.exports = Health;
