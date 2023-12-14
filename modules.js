const path = require('path');

// Подключение системы логирования
const Logger = require('./logger');
module.exports.logger = new Logger(path.join(__dirname, './logger/logs'));;
module.exports.logger.start();

// Подключение системы базы данных
const DB = require('./db');
module.exports.db = new DB();
module.exports.db.start();

// Подключение системы API
const API = require('./api');
module.exports.api = new API();
module.exports.api.start();

// Подключение менеджера команд
const Manager = require('./console_manager');
module.exports.manager = new Manager();
module.exports.manager.exec('clear');
module.exports.manager.start();