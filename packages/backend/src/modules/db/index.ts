import fs from 'node:fs';
import path from 'node:path';
import mongoose, { Schema, type Model, type Connection, type ConnectOptions } from 'mongoose';

import { Module } from '../_class.js';
import modules from '../../modules.js';
import { runtimeExt, importDefault } from '../../functions/importModule.js';
import config, { type DbConfig } from './config.js';

/** Форматы экспорта схемы из файла модели */
type SchemaInput = Schema | [Record<string, unknown>, Record<string, unknown>?] | Record<string, unknown>;

export class DB extends Module<DbConfig> {
    /** Реестр моделей по имени файла */

    models: Record<string, Model<any>> = {};
    /** Отдельное соединение для логов (если включён Mongo-сток логгера) */
    logConnection: Connection | null = null;

    constructor() {
        super(import.meta.dirname, config);
    }

    /**
     * Собирает connection URL + опции подключения.
     * Поддерживает как готовую строку url, так и replica set
     * (replicaSet добавляется в query-string). dbName/user/password — опциональны.
     */
    #buildUrl(cfg: DbConfig): { url: string; options: ConnectOptions } {
        let url = cfg.url;
        const options: ConnectOptions = {};
        if (cfg.dbName) options.dbName = cfg.dbName;
        if (cfg.user) options.user = cfg.user;
        if (cfg.password) options.pass = cfg.password;
        if (cfg.replicaSet) {
            url += (url.includes('?') ? '&' : '?') + `replicaSet=${cfg.replicaSet}`;
        }
        return { url, options };
    }

    protected async startFunction(): Promise<void> {
        this.models = {};

        const cfg = this.getConfig();
        const { url, options } = this.#buildUrl(cfg);

        try {
            await mongoose.connect(url, {
                ...options,
                maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE ?? '') || cfg.maxPoolSize || 20,
                minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE ?? '') || cfg.minPoolSize || 5,
                socketTimeoutMS: cfg.socketTimeoutMS || 30000,
                serverSelectionTimeoutMS: cfg.serverSelectionTimeoutMS || 5000,
                maxIdleTimeMS: cfg.maxIdleTimeMS || 60000,
                readPreference: cfg.replicaSet ? 'secondaryPreferred' : 'primary',
            });
        } catch (e) {
            modules.logger?.log('error', 'Ошибка при подключении к базе данных');
            throw new Error('Ошибка при подключении к базе данных', { cause: e });
        }
        modules.logger?.log('info', 'База данных подключена');

        // Отдельное соединение для логов (только если включён Mongo-сток логгера),
        // чтобы запись логов не конкурировала с основным пулом приложения.
        if (modules.logger?.getConfig?.()?.db_enabled === true) {
            try {
                this.logConnection = mongoose.createConnection(url, { ...options, maxPoolSize: 3, minPoolSize: 1 });
                await this.logConnection.asPromise();
            } catch {
                modules.logger?.log('warn', 'Не удалось создать отдельное соединение для логов, используется основное');
                this.logConnection = null;
            }
        }

        try {
            await this.initModels();
        } catch (e) {
            modules.logger?.log('error', 'Ошибка при инициализации моделей');
            throw new Error('Ошибка при инициализации моделей', { cause: e });
        }
        modules.logger?.log('info', 'Модели инициализированы');
    }

    protected async stopFunction(): Promise<void> {
        if (this.logConnection) {
            try {
                await this.logConnection.close();
            } catch {
                /* ignore */
            }
            this.logConnection = null;
        }
        try {
            await mongoose.disconnect();
        } catch (e) {
            modules.logger?.log('error', 'Ошибка при отключении от базы данных');
            throw new Error('Ошибка при отключении от базы данных', { cause: e });
        }
        modules.logger?.log('info', 'База данных отключена');
    }

    /** Инициализация моделей из директории models + синхронизация индексов */
    async initModels(): Promise<void> {
        const pathModels = path.join(this.getDirname(), this.getConfig().directory);
        const ext = runtimeExt(import.meta.filename);
        const files = fs.existsSync(pathModels)
            ? fs.readdirSync(pathModels).filter((file) => path.extname(file) === ext)
            : [];

        for (const file of files) {
            if (file.startsWith('_')) continue;

            const schema = await importDefault<SchemaInput>(path.join(pathModels, file));
            if (!schema) continue;

            const split = file.split('.');
            const name = split.slice(0, split.length - 1).join('.');

            // Поддержка двух форматов экспорта: готовая Schema или массив аргументов конструктора
            let mongooseSchema: Schema;
            if (schema instanceof Schema) {
                mongooseSchema = schema;
            } else if (Array.isArray(schema)) {
                mongooseSchema = new Schema(schema[0], schema[1]);
            } else {
                mongooseSchema = new Schema(schema);
            }

            this.models[name] = mongoose.model(name, mongooseSchema);
        }

        // Синхронизировать индексы: удалить устаревшие, создать недостающие
        await Promise.all(Object.values(this.models).map((model) => model.syncIndexes()));
    }

    /**
     * Выполнение запроса к БД.
     * @param modelName Название модели
     * @param methodName Название метода модели
     * @param params Список передаваемых параметров
     */
    async req(modelName: string, methodName: string, params: unknown[] = []): Promise<unknown> {
        const error = (message: string): never => {
            modules.logger?.log('error', message);
            throw new Error(message);
        };

        if (!(modelName in this.models)) return error('Модель не найдена или не инициализирована');

        const model = this.models[modelName] as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
        if (!(methodName in model)) return error('Данный метод не найден у модели');

        let result: unknown;
        try {
            result = await model[methodName](...params);
        } catch (e) {
            return error(`Ошибка при выполнении запроса. Сообщение ошибки: ${(e as Error).message}`);
        }

        return JSON.parse(JSON.stringify(result));
    }
}

export default DB;
