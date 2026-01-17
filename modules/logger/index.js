const fs = require('fs');
const path = require('path');
const Module = require('../_class');

class Logger extends Module {
    #logging = false;

    startFunction() { this.#logging = true }
    stopFunction() { this.#logging = false }

    constructor() {
        super(__dirname);
        this.checkFile();
    }

    /**
     * 
     * @param {Boolean} create Необходимо ли создать файл, если он отсутствует
     * @param {String} default_file_name Путь к файлу
     * @description Проверяет наличие файла для записи
     */
    checkFile(create=true, default_file_name=null) {
        const directory = path.join(this.getDirname(), this.getConfig().directory);

        const today = new Date();
        if (this.getConfig().UTC) today.toUTCZone();
        
        const file_name =  default_file_name ? default_file_name :  
            this.getConfig().format.file_name
                .replace('%DD%', today.getDate().toStringWithZeros())
                .replace('%D%', today.getDate())
                .replace('%MM%', (today.getMonth() + 1).toStringWithZeros())
                .replace('%M%', (today.getMonth() + 1))
                .replace('%YYYY%', today.getFullYear())
                .replace('%YY%', (today.getFullYear() % 100).toStringWithZeros())
                + '.' + this.getConfig().format.file_extension
        ;

        const path_to_file = path.join(directory, file_name);
        const files_in_directory = fs.readdirSync(directory);
        const exists_file = Boolean(files_in_directory.find(file => file === file_name));

        let created = false;
        if (!exists_file && create) {
            created = true;
            try { fs.writeFileSync(path_to_file, '[INFO]Файл логирования инициализирован\n', { flag: 'w+' }) }
            catch (e) { created = false }
        }

        
        const result = { exists: created || exists_file, created, path_to_file };
        return result;
    }

    /**
     * 
     * @param {'info'|'warn'|'error'} level Любой уровень сообщения
     * @param {String|Array<String>} message Сообщение или список сообщений
     * @description Добавляет запись в файл
     */
    log(level, message) {
        if (!this.#logging) return false;

        const checked = this.checkFile(true, null);
        if (!checked.exists) return false;

        if (typeof(message) === 'string') message = [ message ];
        message[message.length-1] += '\n';

        const now = new Date();
        if (this.getConfig().UTC) now.toUTCZone();

        const print = message.map(text =>
            this.getConfig().format.log
                .replace('%level%', level.toUpperCase())

                .replace('%HH%', now.getHours().toStringWithZeros())
                .replace('%H%', now.getHours())
                .replace('%MM%', now.getMinutes().toStringWithZeros())
                .replace('%M%', now.getMinutes())
                .replace('%SS%', now.getSeconds().toStringWithZeros())
                .replace('%S%', now.getSeconds())

                .replace('%text%', text)
        );
        fs.writeFileSync(checked.path_to_file, print.join('\n'), { flag: 'a' });

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
     * @param {String} file_name Имя фала
     * @description Возвращает записи из выбранного файла
     * @returns {false|String}
     */
    get(file_name) {
        const extension = this.getConfig().format.file_extension;
        const splited = file_name.split('.');
        if (splited[splited.length - 1] !== extension) file_name += `.${extension}`;

        const checked = this.checkFile(false, file_name);
        
        return checked.exists ? fs.readFileSync(checked.path_to_file).toString() : false;
    }
}

module.exports = Logger;