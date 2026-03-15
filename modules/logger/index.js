const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const Module = require('../_class');

class Logger extends Module {
    #logging = false;

    /** @type {fs.WriteStream|null} */
    #stream = null;
    #streamDate = null;

    startFunction() {
        this.#logging = true;
        this.#cleanOldLogs();
    }

    async stopFunction() {
        this.#logging = false;
        if (this.#stream) {
            await new Promise(resolve => this.#stream.end(resolve));
            this.#stream = null;
            this.#streamDate = null;
        }
    }

    constructor() {
        super(__dirname);
        // Синхронная проверка/создание файла при инициализации
        this.#checkFileSync();
    }

    /**
     * @description Формирует имя файла для текущей даты
     * @returns {string}
     */
    #getFileName(default_file_name = null) {
        if (default_file_name) return default_file_name;

        const today = new Date();
        if (this.getConfig().UTC) today.setTime(today.getTime() + today.getTimezoneOffset() * 6e4);

        const prefix = process.env.VITEST ? 'test-' : '';

        return prefix + this.getConfig().format.file_name
            .replace('%DD%', String(today.getDate()).padStart(2, '0'))
            .replace('%D%', today.getDate())
            .replace('%MM%', String(today.getMonth() + 1).padStart(2, '0'))
            .replace('%M%', (today.getMonth() + 1))
            .replace('%YYYY%', today.getFullYear())
            .replace('%YY%', String(today.getFullYear() % 100).padStart(2, '0'))
            + '.' + this.getConfig().format.file_extension;
    }

    /**
     * @description Синхронная проверка файла (только для конструктора)
     */
    #checkFileSync() {
        const directory = path.join(this.getDirname(), this.getConfig().directory);
        fs.mkdirSync(directory, { recursive: true });

        const file_name = this.#getFileName();
        const path_to_file = path.join(directory, file_name);

        if (!fs.existsSync(path_to_file)) {
            try { fs.writeFileSync(path_to_file, '[INFO]Файл логирования инициализирован\n', { flag: 'w+' }) }
            catch (_e) { /* ignore */ }
        }
    }

    /**
     * @description Получает WriteStream для текущего файла логов
     * @returns {fs.WriteStream}
     */
    #getStream() {
        const file_name = this.#getFileName();

        // Если дата сменилась — закрыть старый стрим и открыть новый
        if (this.#stream && this.#streamDate !== file_name) {
            this.#stream.end();
            this.#stream = null;
        }

        if (!this.#stream) {
            const directory = path.join(this.getDirname(), this.getConfig().directory);
            const path_to_file = path.join(directory, file_name);

            if (!fs.existsSync(path_to_file)) {
                try { fs.writeFileSync(path_to_file, '[INFO]Файл логирования инициализирован\n', { flag: 'w+' }) }
                catch (_e) { return null }
            }

            this.#stream = fs.createWriteStream(path_to_file, { flags: 'a' });
            this.#streamDate = file_name;
        }

        return this.#stream;
    }

    /**
     * @description Удаляет файлы логов старше save_logs дней
     */
    async #cleanOldLogs() {
        const saveDays = this.getConfig().save_logs;
        if (!saveDays || saveDays <= 0) return;

        const directory = path.join(this.getDirname(), this.getConfig().directory);
        const cutoff = Date.now() - saveDays * 24 * 60 * 60 * 1000;

        try {
            const files = await fsp.readdir(directory);
            for (const file of files) {
                const filePath = path.join(directory, file);
                try {
                    const stat = await fsp.stat(filePath);
                    if (stat.mtime.getTime() < cutoff) {
                        await fsp.unlink(filePath);
                    }
                } catch (_e) { /* skip */ }
            }
        } catch (_e) { /* directory might not exist */ }
    }

    /**
     *
     * @param {'info'|'warn'|'error'} level Любой уровень сообщения
     * @param {String|Array<String>} message Сообщение или список сообщений
     * @description Добавляет запись в файл
     */
    log(level, message) {
        if (!this.#logging) return false;

        const stream = this.#getStream();
        if (!stream) return false;

        if (typeof(message) === 'string') message = [ message ];

        const now = new Date();
        if (this.getConfig().UTC) now.setTime(now.getTime() + now.getTimezoneOffset() * 6e4);

        // Выбор потока console по уровню
        const consoleFn = level === 'error' ? console.error
            : level === 'warn' ? console.warn
            : console.log;

        // JSON-формат для structured logging
        if (this.getConfig().json_format) {
            const entries = message.map(text => JSON.stringify({
                level: level.toUpperCase(),
                timestamp: now.toISOString(),
                message: text,
            }));
            const output = entries.join('\n') + '\n';
            stream.write(output);
            consoleFn(output.trimEnd());
            return true;
        }

        // Стандартный текстовый формат
        message[message.length-1] += '\n';
        const print = message.map(text =>
            this.getConfig().format.log
                .replace('%level%', level.toUpperCase())

                .replace('%HH%', String(now.getHours()).padStart(2, '0'))
                .replace('%H%', now.getHours())
                .replace('%MM%', String(now.getMinutes()).padStart(2, '0'))
                .replace('%M%', now.getMinutes())
                .replace('%SS%', String(now.getSeconds()).padStart(2, '0'))
                .replace('%S%', now.getSeconds())

                .replace('%text%', text)
        );
        const output = print.join('\n');
        stream.write(output);
        consoleFn(output.trimEnd());

        return true;
    }

    /**
     * @param {String|Array<String>} message Сообщение или список сообщений
     * @description Добавляет запись в файл с меткой INFO
     */
    info(message) { return this.log('info', message) }
    /**
     * @param {String|Array<String>} message Сообщение или список сообщений
     * @description Добавляет запись в файл с меткой WARN
     */
    warn(message) { return this.log('warn', message) }
    /**
     * @param {String|Array<String>} message Сообщение или список сообщений
     * @description Добавляет запись в файл с меткой ERROR
     */
    error(message) { return this.log('error', message) }

    /**
     *
     * @param {String} file_name Имя файла
     * @description Возвращает записи из выбранного файла
     * @returns {Promise<false|String>}
     */
    async get(file_name) {
        const extension = this.getConfig().format.file_extension;
        const splited = file_name.split('.');
        if (splited[splited.length - 1] !== extension) file_name += `.${extension}`;

        const directory = path.join(this.getDirname(), this.getConfig().directory);
        const path_to_file = path.join(directory, file_name);

        try {
            const content = await fsp.readFile(path_to_file, 'utf-8');
            return content;
        } catch (_e) {
            return false;
        }
    }
}

module.exports = Logger;
