const fs = require('fs');
const path = require('path');

class Module {
    #__dirname;
    /** Возвращает расположение описание модуля  */
    get_dirname() { return this.#__dirname }

    #config = null;
    /** Возвращает конфиг модуля */
    get_config() { return this.#config }
    
    load_config(config_path) {
        if (typeof(config_path) !== 'string') throw new Error('Неверный формат данных');
        let done = true;
        let config;

        try { json = require(path.join(this.#__dirname, config_path)) }
        catch (e) { done = false }

        if (done) this.#config = config;

        return done;
    }

    /**
     * 
     * @param {String} __dirname Путь к папке, где описан класс модуля. Передавайте __dirname
     * @param {String|null} config_path Путь к конфиг файлу от класса модуля
     */
    constructor(__dirname, config_path='config.json') {
        this.#__dirname = __dirname;
        if (config_path) this.load_config(config_path);
    }

    #status = 'off';
    /**
     * @description Получения состояния модуля
     * @returns {'off'|'load'|'on'}
    */
    get_status() { return this.#status }

    /** Функция для непосредственного запуска */
    async start_function() {}
    /** Функция для запуска */
    async start() {
        this.#status = 'load';
        let done = true;

        try { await this.start_function() }
        catch (e) { done = false }
        
        this.#status = done ? 'on' : 'off';
        return done;
    }
    
    /** Функция для непосредственной остановки */
    async stop_function() {}
    /** Функция для оставноки */
    async stop() {
        this.#status = 'off';
        let done = true;

        try { await this.stop_function() }
        catch (e) { done = false }

        return done;
    }
}

module.exports = Module;