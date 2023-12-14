const fs = require('fs');
const Command = require('./command');
const { logger, api, db } = require('../modules');
const custom_interface = require('./custom_interface');
const path = require('path');
const chalk = require('@kitsune-labs/chalk-node');

const logger_config = path.join(__dirname, '../logger/config.json');
const api_config = path.join(__dirname, '../api/config.json');

const interface = {
    logger: {
        status_system: () => logger.is_work(),
        on: new Command('on', 'Включить систему логирования', ({ manager }) => {
            if (!logger.is_work()) {
                logger.start();
                manager.output('info', 'Система логирования включена');
            } else manager.output('warn', 'Система логирования уже включена');
        }),
        off: new Command('off', 'Отключить систему логирования', ({ manager }) => {
            if (logger.is_work()) {
                logger.stop();
                manager.output('info', 'Система логирования отключена');
            } else manager.output('warn', 'Система логирования уже отключена');
        }),
        get: new Command('get', 'Возвращает логи за указанные дату и время', ({ parameters, manager }) => {
            const logs = logger.get(parameters.date, parameters.time_start, parameters.time_end);
            if (Array.isArray(logs) && 0 < logs.length) manager.output(null, logs.map(log => log.log));
            else manager.output('warn', 'Логи за указанный период не найдены');
        }, { parameters: [
            { name: 'date', description: 'Дата, за которую необходимо получить логи', required: true },
            { name: 'time_start', description: 'Время, начиная с которого необходимо вернуть логи', required: false },
            { name: 'time_end', description: 'Время, заканчивая которым необходимо вернуть логи', required: false }
        ] }),
        list: new Command('list', 'Список сохраненных логов', ({ manager }) => {
            const files = 
                fs.readdirSync(logger.get_path())
                .filter(file => path.extname(file) === '.log')
                .sort((a,b) => fs.statSync(path.join(logger.get_path(), a)).mtime.getTime() - fs.statSync(path.join(logger.get_path(), b)).mtime.getTime())
                .map(file => `${path.parse(file).name} ${!fs.existsSync(logger.conf_path(path.parse(file).name)) ? `(${chalk.yellow('.conf файл не найден')})` : ''}`)
            ;

            if (0 < files.length) manager.output(null, files);
            else manager.output('warn', 'Лог файлы не найдены');
        }),

        get_format: new Command('get_format', 'Получить текущий шаблон для логов', ({ flags, manager }) => manager.output(null, flags['-d'] ? JSON.parse(fs.readFileSync(logger_config, 'utf-8')).format : logger.config.format), { flags: [{ name: '-d', description: 'Получить текущий шаблон для логов из конфига' }] }),
        set_format: new Command('set_format', 'Установка нового шаблона для логов', ({ parameters, flags, manager }) => {
            logger.config.format = parameters.format;
            if (flags['-d']) fs.writeFileSync(logger_config, JSON.stringify(logger.config, null, 4));
            manager.output('info', 'Шаблон обновлен');
        }, {
            parameters: [{ name: 'format', description: 'Новый шаблон для логирования', required: true }],
            flags: [{ name: '-d', description: 'Также поменять значение шаблона по умолчанию, в конфиге' }]
        })
    },

    api: {
        status_system: () => api.is_work(),
        ...require('../api/methods_interface'),
        on: new Command('on', 'Включить систему API', ({ manager }) => {
            if (!api.is_work()) {
                api.start();
                manager.output('info', 'Система API запускается. Используйте "status" для проверки состояния.');
            } else manager.output('warn', 'Система API уже включена');
        }),
        off: new Command('off', 'Отключить систему API', ({ manager }) => {
            if (api.is_work()) {
                api.stop();
                manager.output('info', 'Система API отключена');
            } else manager.output('warn', 'Система API уже отключена');
        }),

        get_mode: new Command('get_mode', 'Получить текущий режим сервера', ({ flags, manager }) => manager.output(null, flags['-d'] ? JSON.parse(fs.readFileSync(api_config, 'utf-8')).mode : api.config.mode), { flags: [{ name: '-d', description: 'Получить текущий режим сервера из конфига' }] }),
        set_mode: new Command('set_mode', 'Установка нового режима сервера', ({ parameters, flags, manager }) => {
            api.config.mode = parameters.mode;
            if (flags['-d']) fs.writeFileSync(api_config, JSON.stringify(api.config, null, 4));
            manager.output('info', 'Режим обновлен');
        }, {
            parameters: [{ name: 'mode', description: 'Новый режим запуска сервера (https/http/localhost)', required: true }],
            flags: [{ name: '-d', description: 'Также поменять значение режима по умолчанию, в конфиге' }]
        }),

        get_port: new Command('get_port', 'Получить текущий порт сервера', ({ flags, manager }) => manager.output(null, flags['-d'] ? JSON.parse(fs.readFileSync(api_config, 'utf-8')).port : api.config.port), { flags: [{ name: '-d', description: 'Получить текущий порт из конфига' }] }),
        set_port: new Command('set_port', 'Установка нового порта сервера', ({ parameters, flags, manager }) => {
            api.config.port = parameters.port;
            if (flags['-d']) fs.writeFileSync(api_config, JSON.stringify(api.config, null, 4));
            manager.output('info', 'Порт обновлен');
        }, {
            parameters: [{ name: 'port', description: 'Новый порт запуска сервера', required: true }],
            flags: [{ name: '-d', description: 'Также поменять значение порта по умолчанию, в конфиге' }]
        })
    },

    db: {
        status_system: () => db.is_work(),
        on: new Command('on', 'Включить систему БД', ({ manager }) => {
            if (!db.is_work()) {
                db.start();
                manager.output('info', 'Система БД запускается. Используйте "status" для проверки состояния.');
            } else manager.output('warn', 'Система API уже включена');
        }),
        off: new Command('off', 'Отключить систему БД', ({ manager }) => {
            if (db.is_work()) {
                db.stop();
                manager.output('info', 'Система БД отключена');
            } else manager.output('warn', 'Система БД уже отключена');
        }),
        req: new Command('req', 'Запрос к базе данных', async ({ manager, enter }) => {
            if (db.is_work()) {
                enter = enter.split(' ').slice(1).join(' ').replace(/ /g, '').split('.');
    
                if (enter[0] === 'db') {
                    if (enter[1] in db.models) {
                        const model = db.models[enter[1]];
    
                        let str = enter[2];
                        if (str[str.length - 1] === ')') str = str.substring(0, str.length - 1)
                        const split = str.replace('(', ' ').split(' ');
                        const func = split[0];
                        if (func in model && typeof(model[func]) === 'function') {
                            const parameters_string = split[1];
                            const parameters_array = [];

                            const counter = { '{': 0, '}': 0 };
                            let start_index = 0;
                            for (let i = 0; i < parameters_string.length; i++) {
                                const element = parameters_string[i];
                                if ([ '{', '}' ].indexOf(element) !== -1) counter[element]++;
                                if (counter['{'] === counter['}']) {
                                    if (counter['{'] !== 0) {
                                        parameters_array.push(JSON.parse(parameters_string.substring(start_index, i + 1)));
    
                                        counter['{'] = 0;
                                        counter['}'] = 0;
                                    }
                                    
                                    start_index = i + 1;
                                }
                            }

                            manager.output(null, await model[func](...parameters_array));
                        } else manager.output('error', `"${func}" не является функцией схемы`);
                    } else manager.output('error', `"${enter[1]}" неопределенно в схемах`);
                } else manager.output('error', 'Неверный синтаксис');
            } else manager.output('error', 'Система БД не запущена');
        }, { parameters: [{ name: 'request', description: 'Запрос, который необходимо выполнить к БД. Используйте синтаксис MongoDBCompass', required: true }] })
    },

    ...custom_interface
}

module.exports = interface;