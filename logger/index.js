const fs = require('fs');
const path = require('path');
const chalk = require('@kitsune-labs/chalk-node');

class Logger {

    config = require('./config.json');

    /** Путь к папке для сохранения */
    path;
    /** Путь к папке для сохранения */
    get_path() { return this.path }

    /** Имя файла для логов */
    file_name;

    /** Путь к конфигу лога */
    conf_path(name=this.file_name) { return path.join(this.path, `${name}.conf`) }

    /** Путь к чистому тексту лога */
    log_path(name=this.file_name) { return path.join(this.path, `${name}.log`) }

    /** Сохраненый timeout для обновление файла */
    timeout;

    /** Обновление имени файла */
    update_file_name() {
        const logs = 
            fs.readdirSync(this.path)
            .filter(file_name => ['conf', 'log'].indexOf(file_name.split('.')[1]) !== -1)
            .sort((a, b) => {
                return fs.statSync(path.join(this.path, a)).mtime.getTime() - 
                       fs.statSync(path.join(this.path, b)).mtime.getTime();
            })
        ;

        if (this.config.save_logs < logs.length/2) logs.slice(0, this.config.save_logs).map(file_name => fs.unlinkSync(path.join(this.path, file_name)));

        const now = new Date();
        this.file_name = now.toShortDate(365 <= this.config.save_logs)

        const next = new Date();
        next.setDate(next.getDate() + 1);
        next.setHours(0, 0, 0, 0);

        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => this.update_file_name(), next.getTime() - now.getTime());
    }

    /** Флаг, отвечающий за сохранение логов */
    loging = false;

    /** Флаг, отвечающий за сохранение логов */
    is_work() { return this.loging }

    /** Запуск сохранения логов */
    start() {
        this.loging = true;
        this.log('info', 'Система логирования запущена');
    }

    /** Остановка сохранения логов */
    stop() {
        this.log('info', 'Система логирования остановлена');
        this.loging = false;
    }

    /**
     * 
     * @param {String} path Путь к папке для сохранения
     */
    constructor (path) {
        this.path = path;
        this.update_file_name();
    }

    /**
     * @param {'info'|'warn'|'error'|null} level Уровень сообщения
     * @param {String|[String]} message Сообщение для вывода
     * @description Сохранение лога в файл
     */
    log(level, message) {
        if (this.loging) {
            const now = new Date();
            now.setMilliseconds(0);
    
            const level_str = {
                conf: typeof(level) === 'string' ? `[${chalk[level === 'error' ? 'red' : level === 'warn' ? 'yellow' : 'blueBright'](level.toUpperCase())}]` : '',
                log: typeof(level) === 'string' ? `[${level.toUpperCase()}]` : ''
            };
            const save = str => {
                const log = this.config.format.replace('%time%', `[${now.getHours().toStringWithZeros()}:${now.getMinutes().toStringWithZeros()}:${now.getSeconds().toStringWithZeros()}]`).replace('%message%', str);
                fs.writeFileSync(this.conf_path(), `${JSON.stringify({ time: now.getTime(), log: log.replace('%level%', level_str.conf) })}\n`, { flag: 'a' });
                fs.writeFileSync(this.log_path(), `${log.replace('%level%', level_str.log)}\n`, { flag: 'a' });
            };
    
            if (Array.isArray(message)) message.map(save);
            else save(message);
        }
    }

    /**
     * 
     * @param {String} date Дата логов
     * @param {String} time_start Время начала выборки
     * @param {String} time_end Время конца выборки
     */
    get(date, time_start=null, time_end=null) {
        const path = this.conf_path(date);
        if (fs.existsSync(path)) {
            const split = fs.readFileSync(path, 'utf-8').split('\n');
            const logs = JSON.parse(`[${fs.readFileSync(path, 'utf-8').split('\n').slice(0, (split[split.length - 1] === '' ? split.length - 1 : split.length)).join(',')}]`);

            if (0 < logs.length) {
                const date_start = new Date(logs[0].time);
                if (time_start) {
                    const split = time_start.split(':');
                    if (1 <= split.length) {
                        const int = Number.parseInt(split[0]);
                        if (Number.isInteger(int)) date_start.setHours(int);
                    }
                    if (2 <= split.length) {
                        const int = Number.parseInt(split[1]);
                        if (Number.isInteger(int)) date_start.setMinutes(int);
                    } else date_start.setMinutes(0);
                    if (3 <= split.length) {
                        const int = Number.parseInt(split[2]);
                        if (Number.isInteger(int)) date_start.setSeconds(int);
                    } else date_start.setSeconds(0);
                } else date_start.setHours(0, 0, 0, 0);

                const date_end = new Date(date_start);
                if (time_end) {
                    const split = time_end.split(':');
                    if (1 <= split.length) {
                        const int = Number.parseInt(split[0]);
                        if (Number.isInteger(int)) date_end.setHours(int);
                    }
                    if (2 <= split.length) {
                        const int = Number.parseInt(split[1]);
                        if (Number.isInteger(int)) date_end.setMinutes(int);
                    }
                    if (3 <= split.length) {
                        const int = Number.parseInt(split[2]);
                        if (Number.isInteger(int)) date_end.setSeconds(int);
                    }
                } else date_end.setHours(23, 59, 59, 99);

                const date_start_time = date_start.getTime();
                const date_end_time = date_end.getTime();
                return logs.filter(value => date_start_time <= value.time && value.time <= date_end_time);
            } else return [];
        } else return null;
    }

}

module.exports = Logger;