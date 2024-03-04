const fs = require('fs');
const path = require('path');
const { Model, Schema } = require('mongoose');

const Module = require('../_class');
const modules = require('../../modules');

class DB extends Module {
    /** @type {import('mongoose')} */
    mongoose;
    /** @type {Object.<string, Model<any, unknown, unknown, unknown, any, any>} */
    models;

    async start_function() {
        this.mongoose = require('mongoose');
        this.models = {};

        try { await this.mongoose.connect(this.get_config().url) }
        catch (e) {
            modules.logger.log('error', 'Ошибка при подключение к базе данных');
            throw new Error('Ошибка при подключении к базе данных');
        }
        modules.logger.log('info', 'База данных подключена');
        
        
        try { await this.init_models() }
        catch (e) {
            modules.logger.log('error', 'Ошибка при инициализации моделей');
            throw new Error('Ошибка при инициализации моделей');
        }
        modules.logger.log('info', 'Модели инициализированны');
    }
    
    async stop_function() {
        try { await this.mongoose.disconnect() }
        catch (e) {
            modules.logger.log('error', 'Ошибка при отключении от базы данных');
            throw new Error('Ошибка при отключении от базы данных');
        }
        modules.logger.log('info', 'База данных отключена');
    }

    constructor() { super(__dirname) }

    /** Инициализация моделей */
    async init_models() {
        const path_models = path.join(__dirname, this.get_config().directory);
        const files = fs.readdirSync(path_models).filter(file => path.extname(file) === '.js');
        for (let i = 0; i < files.length; i++) {
            if (files[i] === '_template.js') continue;

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
     * @param {String} model_name Название модели
     * @param {String} method_name Название метода с моделью
     * @param {Array} params Список передаваемых параметров
     */
    async req(model_name, method_name, params=[]) {
        function error(message) {
            modules.logger.log('error', message);
            throw new Error(message);
        }
        modules.logger.log('info', `Выполнение запроса к базе данных. Модель: ${model_name}. Метод: ${method_name}. Параметры: ${JSON.stringify(params)}`);
        
        if (!(model_name in this.models)) return error('Модель не найдена или не инициализирована');
        if (!(method_name in this.models[model_name])) return error('Данный метод не найден у модели');

        let result, done = true;
        try { result = await this.models[model_name][method_name](...params) }
        catch (e) {
            done = false;
            return error(`Ошибка при выполнении запроса. Сообщение ошибки: ${e.message}`);
        }

        if (done) return JSON.parse(JSON.stringify(result));
    }
}

module.exports = DB;