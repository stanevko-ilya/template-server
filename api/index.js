const fs = require('fs');
const express = require('express');
const path = require('path');
const body_parser = require('body-parser');
const http = require('http');
const https = require('https');
const useragent = require('useragent');

const { logger } = require('../modules');
const custom_interface = require('../console_manager/custom_interface');
const Command = require('../console_manager/command');

class API {
    config = require('./config.json');

    /**
     * 
     * @param {*} res res
     * @param {Object|String} data Ответ, который необхоимо вывести
     * @param {Number} code Код ответа
     * @description Возвращает ответ пользователю на API запрос
     */
    static send(res, data, code=200) {
        res.status(code).send(code === 200 ? { response: data } : { error: data });
    }

    /** Главный обработчки */
    express;

    /** Инициализация главного обработчика */
    init_express() {
        this.express = express();

        this.express.use(body_parser.json());
        this.express.use(body_parser.urlencoded({ extended: false }));

        this.express.use((req, res, next) => this.customize(req, res, next, this));
        this.express.use(this.headers);
        
        this.express.use('/', express.static(path.join(__dirname, 'public')));

        this.express.use(this.checker_request);
        this.express.use(this.log);

        this.init_methods();
    }

    init_methods() {
        const inside = (file_path, api_path, container_interface) => {
            const name = file_path.split('/').reverse()[0];
            if (!(name in container_interface)) container_interface[name] = {};

            const is_method = fs.existsSync(path.join(file_path, 'index.js'));
            if (is_method) {
                const method = require(file_path);
                method?.router(api_path, this.express);

                container_interface[name] = {
                    status_system: () => method.config.use,
                    on: new Command('on', 'Включить метод', ({ manager }) => {
                        if (!method.config.use) {
                            method.config.use = true;
                            logger.log('info', `${file_path} включен`);
                            manager.output('info', 'Метод включен');
                        } else manager.output('warn', 'Метод уже запущен');
                    }),
                    off: new Command('off', 'Отключить метод', ({ manager }) => {
                        if (method.config.use) {
                            method.config.use = false;
                            logger.log('info', `${file_path} отключен`);
                            manager.output('info', 'Метод отключен');
                        } else manager.output('warn', 'Метод уже отключен');
                    }),
                    config: new Command('config', 'Получить настройки метода', ({ manager }) => manager.output(null, JSON.stringify(method.config, null, 4)))
                }
            } else fs.readdirSync(file_path, { withFileTypes: true }).filter(item => item.isDirectory()).map(dir => inside(path.join(file_path, dir.name), path.join(api_path, dir.name), container_interface[name]));
        }

        inside(path.join(__dirname, 'methods'), `/${this.config.sub_url ? `${this.config.sub_url}/` : ''}`, require('./methods_interface'));
    }

    /** Данные для связи с SSL */
    options;

    /** Получение данных для связи с SSL */
    init_options() {
        const SSL_PATH = path.join(__dirname, 'SSL-certification');
        this.options = {
            key: fs.readFileSync(path.join(SSL_PATH, 'key.key')), 
            cert: fs.readFileSync(path.join(SSL_PATH, 'certificate.crt')), 
            ca: fs.readFileSync(path.join(SSL_PATH, 'domain.cabundle'))
        }
    }

    constructor () {
        this.init_options();
        this.init_express();
    }

    /* Добавление полей в res и req */
    customize(req, res, next, module) {
        // res
        res.module = module;

        // Контейнер
        req.container_data = req[req.method === 'POST' ? 'body' : 'query'];
        if (!req.container_data) req.container_data = {};

        // Данные отправителя
        const useragent_parsed = useragent.parse(req.get('User-Agent')).toJSON();
        req.user = {
            ip: req.ip.substr(0, 7) === '::ffff:' ? req.ip.substr(7) : req.ip,
            user_agent: {
                browser: useragent_parsed.family,
                device: useragent_parsed.device.family,
                os: useragent_parsed.os.family
            }
        };

        // Конфиг запроса
        req.config = {};

        const split_url = req.originalUrl.split('?')[0].split('/');
        if (split_url[0] === '') split_url.splice(0, 1);
        const split_sub_url = this.config.sub_url.split('/');

        if (split_sub_url.toString() === split_url.slice(0, split_sub_url.length).toString()) {
            req.config.found = true;
            const method_path = path.join(__dirname, `methods/${split_url.slice(split_sub_url.length).join('/')}/index.js`);
            if (fs.existsSync(method_path)) req.config = { ...req.config, ...require(method_path).config };
        }

        // Будет ли залогирован запрос
        req.log = res.module.config.logging && req.config.found;
        
        next();
    }

    /** Отправка заголовков клиенту */
    headers(req, res, next) {
        for (let i=0; i < res.module.config.headers.length; i++) {
            const header = res.module.config.headers.length[i];
            res.setHeader(header.name, header.value);
        }
        
        if (req.method === 'OPTIONS') res.status(200).send('OK');
        else next();
    }

    /**
     * 
     * @param {Object} req 
     * @param {Object} res 
     * @param {String[]} params 
     * @param {Boolean} error 
     */
    params(req, res, params, error=true) {
        const not_found = [];
        for (let i = 0; i < params.length; i++) {
            if (!(params[i] in req.container_data)) {
                not_found.push(params[i]);
                break; // Закомментируйте, если хотите получить полный список не найденных обязательных параметров
            }
        }
        if (not_found.length > 0 && error) API.send(res, { code: 1, message: `Параметр \`${not_found[0]}\` не найден` }, 400);
        return { result: not_found.length === 0, not_found: not_found }
    }

    /** Проверка запроса */
    checker_request(req, res, next) {
        if (!req.config?.found) {
            next();
            return false;
        }

        if (!req.config.use) {
            API.send(res, { code: 2, message: 'Метод отключен' }, 404);
            return false;
        }

        if (req.config.auth) {
            // Проверка авторизации
        }

        let config_params = [];
        if ('params' in req.config) config_params = req.config.params;

        const required_params = [];
        const add_required_param = name => required_params.push(name);
        const change_value = (name, format) => {
            if (typeof(format) === 'function' && name in req.container_data)
                req.container_data[name] = format(req.container_data[name]);
        };
        
        for (let i = 0; i < config_params.length; i++) {
            const param = config_params[i];
            switch (typeof(param)) {
                case 'object':
                    if (param.required) add_required_param(param.name);
                    
                    let format;
                    switch (param.type) {
                        case 'boolean':
                            format = value => Number.parseInt(value) === 1;
                        break;

                        case 'number':
                            format = value => {
                                value = +value;
                                if (
                                    (param.orientation === 'positive' && value < 0)
                                    ||
                                    (param.orientation === 'negative' && value > 0)
                                )
                                    value *= -1;
                                return value;
                            };
                        break;

                        case 'object':
                            format = value => {
                                let return_value;
                                try {
                                    return_value = JSON.parse(value);
                                } catch (e) {
                                    this.send();
                                }
                                return return_value;
                            };
                        break;

                        default:
                            format = value => value;
                    }
                    
                    try {
                        change_value(param.name, format);
                    } catch (e) {
                        API.send(res, { code: 3, message: e.message }, 400);
                        return false;
                    }

                    const value = req[req.container_data][param.name];

                    if (param.type === 'number' && 'interval' in param && (value < param.interval[0] || param.interval[1] < value)) {
                        API.send(res, { code: 4, message: `Значение параметра \`${param.name}\` не попадает в интервал: ${JSON.stringify(param.interval)}` });
                        return false;
                    }

                    if ('valid_values' in param && param.valid_values.indexOf(value) === -1) {
                        API.send(res, { code: 5, message: `Невалидное значение для параметра \`${param.name}\` `}, 400);
                        return false;
                    }
                break;

                case 'string':
                    add_required_param(param);
                break;
            }
        }
        if (res.module.params(req, res, required_params).result) next();
    }

    /** Логирование запросов */
    log(req, res, next) {
        if (req.log) logger.log('info', `API | ${req.originalUrl} | ${req.user.ip}`);
            
        try {
            next();
        } catch (e) {
            logger.log('error', e);
            API.send(res, { code: 0, message: 'Ошибка во время обработки', payload: e.message }, 500);
        }
    }
 
    server;
    /** Запуск сервера */
    start() {
        let server;
        const mode = this.config.mode;
        if (mode === 'https') server = https.createServer(this.options, this.express);
        else if (mode === 'http') server = http.createServer(this.options, this.express);
        else if (mode === 'localhost') server = this.express;

        if (server) {
            server.timeout = 1000;
            const port = this.config.port;
            const start = async () => server.listen(port, () => {
                this.server = server;
                logger.log('info', `Система API запущена: режим ${mode}, порт ${port}`);
            });
            
            if (mode === 'localhost') server = start();
            else start();
        }
    }

    /** Остановка сервера */
    stop() {
        if (this.server) {
            this.server.close();
            this.server = undefined;
            logger.log('info', 'Система API отключена');
        }
    }

    is_work() { return Boolean(this.server) }

}

module.exports = API;