const chalk = require('@kitsune-labs/chalk-node');
const Command = require('./command');
const ConsoleTable = require('cli-table');

const prompt = require('prompt');
const { logger } = require('../modules');
prompt.delimiter = '';

class Manager {

    /** Конфиг */
    config = require('./config.json');

    /** Интерфейс управления */
    interface = {};

    /** Текущее положение курсора */
    cursor = '';
    
    /** Флаг, отвечающий за прослушивание ввода */
    listening = false;

    /** Список команд, которые доступны в любом месте */
    global_commands = [
        new Command('clear', 'Очистить консоль', () => {
            var lines = process.stdout.getWindowSize()[1];
            for(var i = 0; i < lines; i++) { console.log('\r\n') }
        }),
        new Command('use', 'Переход к выбраному модулю интерфейса', ({ parameters, current_interface, manager }) => {
            let found = false;
            const keys = Object.keys(current_interface);
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                if (key === parameters.module) {
                    found = true;
                    if (!(current_interface[key] instanceof Command)) manager.cursor += `${manager.cursor === '' ? '' : '.'}${key}`;
                    else manager.output('warn', 'Введенное значение не является встроеным модулем');
                    break;
                }
            }

            if (!found) manager.output('warn', 'Модуль не найден');
        }, { parameters: [{ name: 'module', description: 'Модуль интерфейса', required: true }] }),
        new Command('back', 'Вернуться в родительский модуль', ({ manager, flags }) => {
            if (flags['-r']) manager.cursor = '';
            else {
                const split = manager.cursor.split('.');
                manager.cursor = split.slice(0, split.length - 1).join('.');
            }
        }, { flags: [{ name: '-r', description: 'Вернуться в корневой модуль' }] }),
        new Command('interface', 'Отображает текущий интерфейс', ({ current_interface, flags, manager }) => {
            const strings = [];
            const inside = (local_interface, level) => {
                const keys = Object.keys(local_interface);
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    if (this.config.hide_keys.indexOf(key) === -1) {
                        const string = `${`|${` `.repeat(this.config.space_size)}`.repeat(level)}|—— ${local_interface[key] instanceof Command ? local_interface[key].info() : typeof(local_interface[key]) === 'object' ? `${chalk.cyan(key)}: Модуль` : `${chalk.red(key)}: unknow`}`;
                        strings.push(string);
                        if (!(local_interface[key] instanceof Command) && flags['-f']) inside(local_interface[key], level + 1);
                    }
                }
            }

            if (flags['-g']) {
                current_interface = {};
                for (let i = 0; i < this.global_commands.length; i++) {
                    const command = this.global_commands[i];
                    current_interface[command.get_name()] = command;
                }
            }

            if (Object.keys(current_interface).length === 0) manager.output('info', 'Пустой интерфейс. Используйте "interface -g" для просмотра глобального интерфейса');
            else {
                inside(current_interface, 0);
                manager.output(null, strings);
            }
        }, { flags: [
            { name: '-g', description: 'Доступ к глобальному интерфейсу' },
            { name: '-f', description: 'Отображение всех вложенных модулей и функций' }
        ] }),
        new Command('help', 'Подробное описание о заданной функции в интерфейсе', ({ parameters, manager, current_interface }) => {
            const commands = [...this.global_commands];
            for (const key in current_interface) { if (current_interface[key] instanceof Command) commands.push(current_interface[key]) }
            let found = false;
            for (let i = 0; i < commands.length; i++) {
                const command = commands[i];
                if (command.check_name(parameters.command)) {
                    found = true;
                    manager.output(null, command.help());
                    break;
                }
            }

            if (!found) manager.output('warn', 'Команда не найдена');
        }, { parameters: [{ name: 'command', description: 'Команда, о которой необходимо вывести информацию', required: true }] }),
        new Command('status', 'Информация о всех системах', ({ manager, flags }) => {
            const os = require('os');

            const network_interfaces = os.networkInterfaces();
            const strings = [
                `OS: ${os.type()} ${os.arch()}`,
                `IP: ${network_interfaces[Object.keys(network_interfaces).reverse()[0]][0].address}`
            ];
            const systems = [];
            const inside = (local_interface, path='') => {
                for (const key in local_interface) {
                    if (typeof(local_interface[key]) === 'object' && local_interface[key] !== null && !(local_interface[key] instanceof Command)) {
                        const full_path = `${path}${key}`;
                        if ('status_system' in local_interface[key] && typeof(local_interface[key].status_system) === 'function') {
                            systems.push([ full_path, local_interface[key].status_system() ? 'on' : 'off' ]);
                            systems[systems.length - 1][1] = chalk[systems[systems.length - 1][1] === 'on' ? 'green' : 'red'](systems[systems.length - 1][1].toUpperCase());
                        }
                        if (flags['-f']) inside(local_interface[key], `${full_path}.`);
                    }
                }
            }
            inside(this.interface);
            strings.push(
                new ConsoleTable({
                    head: [ chalk.cyan('Система'), chalk.cyan('Статус') ],
                    rows: systems,
                    colAligns: [ 'left', 'right' ] 
                }).toString()
            );
            manager.output(null, strings);
        }, { flags: [{ name: '-f', description: 'Отображение состания всех подсистема' }] }),
        new Command('shutdown', 'Отключить сервер', ({ manager }) => {
            manager.output('info', 'Отключение...');

            // Код, которые выполнится перед отключением сервера

            logger.log('info', 'Сервер отключен');
            process.exit();
        }),
    ];

    /**
     * 
     * @param {Object} start_interface Предустановленый интерфейс управления управления
     */
    constructor(start_interface=require('./interface')) {
        this.interface = start_interface;
    }

    /**
     * @param {'info'|'warn'|'error'|null} level Уровень сообщения
     * @param {String|[String]} message Сообщение для вывода
     * @description Вывод сообщений в консоль
     */
    output(level, message) {
        const level_str = typeof(level) === 'string' ? `[${chalk[level === 'error' ? 'red' : level === 'warn' ? 'yellow' : 'blueBright'](level.toUpperCase())}]` : '';
        const print = str => console.log(this.config.format.replace('%level%', level_str).replace('%message%', str));

        if (Array.isArray(message)) message.map(print);
        else print(message);
    }

    /** Запуск прослушивания ввода */
    start() {
        this.listening = true;
        this.listen();
    }

    /** Остановка прослушивания ввода */
    stop() { this.listening = false }

    /** Прослушивание ввода */
    listen() {
        prompt.message = `${this.cursor === '' ? this.config.root : this.cursor} `;
        prompt.get({ message: '>' }, async (err, result) => {
            if (result === undefined) console.log(''); 
            else await this.process(result.question);
            if (this.listening) this.listen();
        });
    }

    /** Обработка ввода */
    async process(enter='') {
        const start_enter = enter;
        enter = enter.replace(/ +/g, ' ');
        enter = enter.substring(Number(enter[0] === ' '), enter.length - Number(enter[enter.length - 1] === ' ')).split(' ');

        const current_interface = this.get_current_interface();
        const commands = [...this.global_commands];
        for (const key in current_interface) { if (current_interface[key] instanceof Command) commands.push(current_interface[key]) }
        let used = false;

        for (let i = 0; i < commands.length; i++) {
            const command = commands[i];
            if (command.check_name(enter[0])) {
                used = true;

                const parameters = {};
                const flags = {};

                const command_parameters = command.get_parameneters();
                const required = command_parameters.filter(value => value.required).map(value => value.name);
                for (let i = 1; i < enter.length; i++) {
                    const value = enter[i];
                    if (value[0] === '-' && command.valid_flag(value)) flags[value] = true;
                    else if (0 < command_parameters.length) {
                        const index = Object.keys(parameters).length;
                        if (index < command_parameters.length) {
                            const option_parameter = command_parameters[index];
                            
                            let format = value => value;
                            if ('type' in option_parameter) {
                                switch (option_parameter.type) {
                                    case 'number':
                                        format = value => {
                                            const new_value = +value;
                                            if (typeof(new_value) === 'number') return new_value;
                                            else return 0;
                                        };
                                    break;

                                    case 'boolean':
                                        format = value => ['1', 'true'].indexOf(value) !== -1 ? true : false;
                                    break;
                                }

                            }
                            parameters[option_parameter.name] = format(value);
                            
                            const index_splice = required.indexOf(option_parameter.name);
                            if (index_splice !== -1) required.splice(index_splice, 1);
                        }
                    }
                }

                if (required.length === 0) {
                    try {
                        await command.use({
                            parameters, flags,
                            current_interface,
                            manager: this,
                            enter: start_enter
                        });
                    } catch (e) {
                        this.output('error', 'Ошибка во время выполнения команды');
                        this.output('info', e);
                    }
                } else this.output('error', `Не переданы параметры: ${required.join(', ')}. Используйте "help ${command.get_name()}" для подробной информации`);

                break;
            }
        }

        if (!used) this.output('warn', 'Неизвестная команда. Используйте "interface" для просмотра интерфеса и "interface -g" для глобального интерфейса');
    }

    /**
     * 
     * @param {String} command Команда для выполнения
     * @description Выполнения консольной команды в менеджере 
     */
    async exec(command) { await this.process(command) }

    /**
     * 
     * @param {String} cursor Положение курсора
     * @param {Object} interface Глобальный интерфейс
     * @returns {*} Интерфейс соответсвующий переданному курсору в глобальном интерфейсе
     */
    get_current_interface(cursor=this.cursor, global_interface=this.interface) {
        const split = cursor.split('.');
        let current_interface = global_interface;
        for (let i = 0; i < split.length; i++) {
            const node = split[i];
            if (node in current_interface) current_interface = current_interface[node];
        }

        return current_interface;
    }

}

module.exports = Manager;