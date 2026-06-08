const path = require('path');
const directorySearch = require('./functions/directorySearch');

module.exports = {
    /** @type {import('./modules/logger')} */
    logger: null,

    /** @type {import('./modules/db')} */
    db: null,

    /** @type {import('./modules/cache')} */
    cache: null,

    /** @type {import('./modules/api')} */
    api: null,

    /** @type {import('./modules/sockets')} */
    sockets: null,

    /** @type {import('./modules/notifier')} */
    notifier: null,

    /** @type {import('./modules/health')} */
    health: null
};

directorySearch(
    path.join(__dirname, './modules'),
    file_path => {
        const module_class = require(file_path);
        const name = file_path.replace(/\\/g, '/').split('/').reverse()[1];
        module.exports[name] = new module_class();
    },
    'index.js'
);
