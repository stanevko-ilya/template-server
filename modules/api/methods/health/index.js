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

    getTest() {
        return {
            request: {},
            expect: {
                status: 200,
                body: (response) => response.status === 'ok'
            }
        };
    }

    constructor(url, express) { super(__dirname, url, express) }
}

module.exports = Health;
