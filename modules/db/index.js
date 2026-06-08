const fs = require('fs');
const path = require('path');
const { Schema } = require('mongoose');

const Module = require('../_class');
const modules = require('../../modules');

class DB extends Module {
    /** @returns {typeof import('./config.json')} */
    getConfig() { return super.getConfig(); }

    /** @type {import('mongoose')} */
    mongoose;
    /** @type {Object.<string, import('mongoose').Model<any>>} */
    models;
    /** @type {import('mongoose').Connection|null} */
    logConnection = null;

    /**
     * Собирает connection URL + опции подключения.
     * Поддерживает как готовую строку url, так и replica set
     * (replicaSet добавляется в query-string). dbName/user/password — опциональны.
     */
    #buildUrl(config) {
        let url = config.url;
        const options = {};
        if (config.dbName) options.dbName = config.dbName;
        if (config.user) options.user = config.user;
        if (config.password) options.pass = config.password;
        if (config.replicaSet) {
            url += (url.includes('?') ? '&' : '?') + `replicaSet=${config.replicaSet}`;
        }
        return { url, options };
    }

    async startFunction() {
        this.mongoose = require('mongoose');
        this.models = {};

        const config = this.getConfig();
        const { url, options } = this.#buildUrl(config);

        try {
            await this.mongoose.connect(url, {
                ...options,
                maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE) || config.maxPoolSize || 20,
                minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE) || config.minPoolSize || 5,
                socketTimeoutMS: config.socketTimeoutMS || 30000,
                serverSelectionTimeoutMS: config.serverSelectionTimeoutMS || 5000,
                maxIdleTimeMS: config.maxIdleTimeMS || 60000,
                readPreference: config.replicaSet ? 'secondaryPreferred' : 'primary',
            });
        } catch (e) {
            modules.logger.log('error', 'Ошибка при подключении к базе данных');
            throw new Error('Ошибка при подключении к базе данных', { cause: e });
        }
        modules.logger.log('info', 'База данных подключена');

        // Отдельное соединение для логов (только если включён Mongo-сток логгера),
        // чтобы запись логов не конкурировала с основным пулом приложения.
        if (modules.logger?.getConfig?.()?.db_enabled === true) {
            try {
                this.logConnection = this.mongoose.createConnection(url, { ...options, maxPoolSize: 3, minPoolSize: 1 });
                await this.logConnection.asPromise();
            } catch (_e) {
                modules.logger.log('warn', 'Не удалось создать отдельное соединение для логов, используется основное');
                this.logConnection = null;
            }
        }

        try { await this.initModels(); }
        catch (e) {
            modules.logger.log('error', 'Ошибка при инициализации моделей');
            throw new Error('Ошибка при инициализации моделей', { cause: e });
        }
        modules.logger.log('info', 'Модели инициализированы');
    }

    async stopFunction() {
        if (this.logConnection) {
            try { await this.logConnection.close(); } catch (_e) { /* ignore */ }
            this.logConnection = null;
        }
        try { await this.mongoose.disconnect(); }
        catch (e) {
            modules.logger.log('error', 'Ошибка при отключении от базы данных');
            throw new Error('Ошибка при отключении от базы данных', { cause: e });
        }
        modules.logger.log('info', 'База данных отключена');
    }

    constructor() { super(__dirname); }

    /** Инициализация моделей из директории models + синхронизация индексов */
    async initModels() {
        const path_models = path.join(__dirname, this.getConfig().directory);
        const files = fs.readdirSync(path_models).filter(file => path.extname(file) === '.js');

        for (let i = 0; i < files.length; i++) {
            if (files[i].startsWith('_')) continue;

            const schema = require(path.join(path_models, files[i]));
            if (schema) {
                const split = files[i].split('.');
                const name = split.slice(0, split.length - 1).join('.');
                // Поддержка двух форматов экспорта: готовая Schema или массив аргументов конструктора
                const mongooseSchema = schema instanceof Schema
                    ? schema
                    : new Schema(...(Array.isArray(schema) ? schema : [schema]));
                this.models[name] = this.mongoose.model(name, mongooseSchema);
            }
        }

        // Синхронизировать индексы: удалить устаревшие, создать недостающие
        await Promise.all(Object.values(this.models).map(model => model.syncIndexes()));
    }

    /**
     * @description Выполнения запроса к БД
     * @param {String} model_name Название модели
     * @param {String} method_name Название метода с моделью
     * @param {Array} params Список передаваемых параметров
     */
    async req(model_name, method_name, params = []) {
        function error(message) {
            modules.logger.log('error', message);
            throw new Error(message);
        }

        if (!(model_name in this.models)) return error('Модель не найдена или не инициализирована');
        if (!(method_name in this.models[model_name])) return error('Данный метод не найден у модели');

        let result;
        try { result = await this.models[model_name][method_name](...params); }
        catch (e) { return error(`Ошибка при выполнении запроса. Сообщение ошибки: ${e.message}`); }

        return JSON.parse(JSON.stringify(result));
    }
}

module.exports = DB;
