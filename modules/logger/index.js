const fs = require('fs');
const path = require('path');
const Module = require('../_class');

class Logger extends Module {
    #logging = false;

    start_function() { this.#logging = true }
    stop_function() { this.#logging = false }

    constructor() {
        super(__dirname);
        // this.check_file();
    }

    /**
     * 
     * @param {Boolean} create Необходимо ли создать файл, если он отсутствует
     * @param {String} default_file_name Путь к файлу
     */
    check_file(create=true, default_file_name=null) {
        const directory = path.join(this.get_dirname(), this.get_config().directory);

        const today = new Date();
        if (this.get_config().UTC) today.toUTCZone();
        
        const file_name =  default_file_name ? default_file_name :  
            this.get_config().format.file_name
                .replace('%DD%', today.getDate().toStringWithZeros())
                .replace('%D%', today.getDate())
                .replace('%MM%', (today.getDate() + 1).toStringWithZeros())
                .replace('%M%', (today.getDate() + 1))
                .replace('%YYYY%', today.getFullYear())
                .replace('%YY%', (today.getFullYear() % 100).toStringWithZeros())
                + '.' + this.get_config().format.file_extension
        ;

        const files_in_directory = fs.readdirSync(directory);
        const exists_file = Boolean(files_in_directory.find(file => file === file_name));

        let created = false;
        if (!exists_file && create) {
            created = true;
            try { fs.writeFileSync(path.join(directory, file_name), '', { mode: 'w' }) }
            catch (e) { created = false }
        }
        
        const result = { exists: created || exists_file, created };
        if (result.exists) result.path_to_file = path.join(directory, file_name);

        return result;
    }

    /**
     * 
     * @param {'info'|'warn'|'error'|String} level Любой уровень сообщения
     * @param {String|Array<String>} message Сообщение или список сообщений
     */
    log(level, message) {
        if (!this.#logging) return false;

        const checked = this.check_file(true, null);
        if (!checked.exists) return false;

        if (typeof(message) === 'string') message = [ message ];
        message.push('\n');

        const now = new Date();
        if (this.get_config().UTC) now.toUTCZone();

        const print = message.map(text =>
            this.get_config().format.log
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
     * 
     * @param {String} file_name Имя фала
     */
    get(file_name) {
        const extension = this.get_config().format.file_extension;
        const splited = file_name.split('.');
        if (splited[splited.length - 1] !== extension) file_name += `.${extension}`;

        const checked = this.check_file(false, file_name);
        
        return checked.exists ? fs.readFileSync(checked.path_to_file).toString() : false;
    }
}

module.exports = Logger;