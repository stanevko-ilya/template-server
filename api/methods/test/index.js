const API = require('../..');

module.exports.config = require('./config.json');
module.exports.router = (path, app) => app[this.config.method](path, (req, res) => {
    API.send(res, req.container_data);
});