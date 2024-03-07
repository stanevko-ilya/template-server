const path = require('path');
const directory_search = require('./functions/directory_search');

module.exports = {
    /** @type {import('./modules/logger')} */
    logger: null,

    /** @type {import('./modules/db')} */
    db: null,

    /** @type {import('./modules/api')} */
    api: null
};

directory_search(
    path.join(__dirname, './modules'),
    file_path => {
        const module_class = require(file_path);
        const name = file_path.replace(/\\/g, '/').split('/').reverse()[1];
        module.exports[name] = new module_class();
    },
    'index.js'
);