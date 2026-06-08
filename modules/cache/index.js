const Module = require('../_class');
const modules = require('../../modules');

/**
 * @description Обёртка над Redis (ioredis) с поддержкой Sentinel и graceful-degradation.
 * Если Redis недоступен — методы возвращают безопасные значения по умолчанию,
 * а модуль всё равно стартует (кэш опционален для шаблона).
 */
class Cache extends Module {
    /** @returns {typeof import('./config.json')} */
    getConfig() { return super.getConfig(); }

    /** @type {import('ioredis').Redis} */
    #redis = null;

    async startFunction() {
        const Redis = require('ioredis');
        const config = this.getConfig();

        const sentinels = config.sentinelsJson ? JSON.parse(config.sentinelsJson) : null;

        const baseOptions = {
            password: config.password || undefined,
            username: config.username || undefined,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            enableOfflineQueue: false,
            // Перестаём долбиться в Redis после 10 неудачных попыток (тихая деградация)
            retryStrategy: (times) => (times > 10 ? null : Math.min(times * 200, 2000)),
        };

        if (sentinels && sentinels.length > 0) {
            // Режим Sentinel (HA)
            this.#redis = new Redis({ sentinels, name: config.masterName, ...baseOptions });
        } else {
            // Прямое подключение (локальная разработка)
            this.#redis = new Redis({
                host: config.directHost || '127.0.0.1',
                port: Number(config.directPort) || 6379,
                ...baseOptions,
            });
        }

        // Гасим события error, чтобы ioredis не бросал unhandled при отсутствии Redis
        this.#redis.on('error', () => {});

        try {
            await this.#redis.connect();
            modules.logger?.info('Redis подключён');
        } catch (e) {
            modules.logger?.warn('Redis недоступен, кэш работает в degraded-режиме: ' + e.message);
        }
    }

    async stopFunction() {
        if (this.#redis) {
            try { await this.#redis.quit(); } catch (_e) { /* ignore */ }
            this.#redis = null;
            modules.logger?.info('Redis отключён');
        }
    }

    /**
     * @param {String} key
     * @returns {Promise<String|null>}
     */
    async get(key) {
        try { return await this.#redis.get(key); }
        catch (e) { modules.logger?.warn('Cache.get error: ' + e.message); return null; }
    }

    /**
     * @param {String} key
     * @param {String|Object} value — объект будет сериализован в JSON
     * @param {Number} [ttl] — TTL в секундах (опционально)
     */
    async set(key, value, ttl = null) {
        try {
            const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
            if (ttl) await this.#redis.set(key, serialized, 'EX', ttl);
            else await this.#redis.set(key, serialized);
        } catch (e) { modules.logger?.warn('Cache.set error: ' + e.message); }
    }

    /**
     * @param {String} key
     * @returns {Promise<Object|null>} — десериализует JSON
     */
    async getJson(key) {
        const val = await this.get(key);
        if (!val) return null;
        try { return JSON.parse(val); }
        catch (_e) { return null; }
    }

    /**
     * @param {String} key
     */
    async del(key) {
        try { await this.#redis.del(key); }
        catch (e) { modules.logger?.warn('Cache.del error: ' + e.message); }
    }

    /**
     * Атомарно увеличивает значение ключа на 1
     * @param {String} key
     * @returns {Promise<Number|null>} — новое значение
     */
    async incr(key) {
        try { return await this.#redis.incr(key); }
        catch (e) { modules.logger?.warn('Cache.incr error: ' + e.message); return null; }
    }

    /**
     * SET если ключ не существует (атомарно)
     * @param {String} key
     * @param {String} value
     * @param {Number} [ttl] — TTL в секундах
     * @returns {Promise<Boolean>} — true если ключ был установлен
     */
    async setnx(key, value, ttl = null) {
        try {
            let result;
            if (ttl) result = await this.#redis.set(key, String(value), 'EX', ttl, 'NX');
            else result = await this.#redis.set(key, String(value), 'NX');
            return result === 'OK';
        } catch (e) { modules.logger?.warn('Cache.setnx error: ' + e.message); return false; }
    }

    /**
     * Установить TTL на существующий ключ
     * @param {String} key
     * @param {Number} ttl — TTL в секундах
     */
    async expire(key, ttl) {
        try { await this.#redis.expire(key, ttl); }
        catch (e) { modules.logger?.warn('Cache.expire error: ' + e.message); }
    }

    /**
     * @param {String} key
     * @returns {Promise<Boolean>}
     */
    async exists(key) {
        try { return (await this.#redis.exists(key)) === 1; }
        catch (_e) { return false; }
    }

    /**
     * @returns {import('ioredis').Redis|null} Сырой клиент — ТОЛЬКО когда Redis реально подключён.
     * Без коннекта (degraded) возвращает null: иначе потребители (rate-limit store, socket-adapter)
     * получили бы живой, но неподключённый инстанс с enableOfflineQueue:false и падали бы на первой команде.
     */
    get client() { return this.#redis?.status === 'ready' ? this.#redis : null; }

    constructor() { super(__dirname); }
}

module.exports = Cache;
