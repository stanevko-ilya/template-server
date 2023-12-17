const { Schema } = require('mongoose');
const Module = require('../_class');

class DB extends Module {
    /** @type {import('mongoose')} */
    mongoose;
    models;

    async start_function() {
        this.mongoose = require('mongoose');
        this.models = {};

        try { await this.mongoose.connect(this.get_config().url) }
        catch (e) {
            // TODO: логирование, ошибка при подключениие к базе данных
            throw new Error('Ошибка при подключении к базе данных');
        }
        // TODO: логирование, БД включена
        
        try { await this.init_models() }
        catch (e) {
            // TODO: логирование, ошибка при инициализации моделей
            throw new Error('Ошибка при инициализации моделей');
        }
        // TODO: логирование, модели инициализированны
    }
    
    async stop_function() {
        try { await this.mongoose.disconnect() }
        catch (e) {
            // TODO: логирование, ошибка при отключении 
            throw new Error('Ошибка при отключении от базы данных');
        }
        // TODO: логирование, БД отключена
    }

    constructor() { super(__dirname) }

    /** Инициализация моделей */
    async init_models() {
        const path_models = path.join(__dirname, this.get_config().directory);
        const files = fs.readdirSync(path_models).filter(file => path.extname(file) === '.js');
        for (let i = 0; i < files.length; i++) {
            const schema = require(path.join(path_models, files[i]));
            if (schema instanceof Object) {
                const split = files[i].split('.');
                const name = split.slice(0, split.length - 1).join('.');
                this.models[name] = this.mongoose.model(name, Schema(...schema));
            }
        }
    }

    /**
     * @description Выполнения запроса к БД
     */
    async req() {

    }
}

module.exports = DB;