const path = require('path');

class Module {
    #__dirname;
    /** Возвращает расположение описание модуля  */
    getDirname() { return this.#__dirname }

    #config = null;
    /** Возвращает конфиг модуля */
    getConfig() { return this.#config }
    
    /**
     * 
     * @param {String} config_path Путь к файлу конфига
     * @param {Function|null} format Функция дял автоматического редактирование конфига при загрузке (добавление/удаление полей)
     */
    /**
     * @description Подставляет значения переменных окружения вместо ${VAR_NAME} в строках конфига
     */
    #interpolateEnv(obj) {
        if (typeof obj === 'string') {
            return obj.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || '');
        }
        if (Array.isArray(obj)) return obj.map(item => this.#interpolateEnv(item));
        if (obj && typeof obj === 'object') {
            const result = {};
            for (const key in obj) result[key] = this.#interpolateEnv(obj[key]);
            return result;
        }
        return obj;
    }

    loadConfig(config_path, format=null) {
        if (typeof(config_path) !== 'string') throw new Error('Неверный формат данных');
        let done = true;
        let config;

        try { config = require(path.join(this.#__dirname, config_path)) }
        catch (_e) { done = false }

        if (done) {
            config = this.#interpolateEnv(config);
            if (format instanceof Function) config = format(config);
            this.#config = config;
        }

        return done;
    }

    /**
     * 
     * @param {String} __dirname Путь к папке, где описан класс модуля. Передавайте __dirname
     * @param {String|null} config_path Путь к конфиг файлу от класса модуля
     */
    constructor(__dirname, config_path='./config.json') {
        this.#__dirname = __dirname;
        if (config_path) this.loadConfig(config_path);
    }

    #status = 'off';
    /**
     * @description Получения состояния модуля
     * @returns {'off'|'load'|'on'}
    */
    getStatus() { return this.#status }

    /** Функция для непосредственного запуска */
    async startFunction() {}
    /** Функция для запуска */
    async start() {
        await this.startFunction()
        
        this.#status = 'on';
        return true;
    }
    
    /** Функция для непосредственной остановки */
    async stopFunction() {}
    /** Функция для оставноки */
    async stop() {
        this.#status = 'off';

        await this.stopFunction()
        return true;
    }
}

module.exports = Module;