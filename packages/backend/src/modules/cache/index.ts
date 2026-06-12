import { Redis, type RedisOptions } from 'ioredis';

import { Module } from '../_class.js';
import modules from '../../modules.js';
import config, { type CacheConfig } from './config.js';

/**
 * Обёртка над Redis (ioredis) с поддержкой Sentinel и graceful-degradation.
 * Если Redis недоступен — методы возвращают безопасные значения по умолчанию,
 * а модуль всё равно стартует (кэш опционален для шаблона).
 */
export class Cache extends Module<CacheConfig> {
    #redis: Redis | null = null;

    constructor() {
        super(import.meta.dirname, config);
    }

    protected async startFunction(): Promise<void> {
        const cfg = this.getConfig();

        const sentinels = cfg.sentinelsJson ? JSON.parse(cfg.sentinelsJson) : null;

        const baseOptions: RedisOptions = {
            password: cfg.password || undefined,
            username: cfg.username || undefined,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            enableOfflineQueue: false,
            // Перестаём долбиться в Redis после 10 неудачных попыток (тихая деградация)
            retryStrategy: (times: number) => (times > 10 ? null : Math.min(times * 200, 2000)),
        };

        if (sentinels && sentinels.length > 0) {
            // Режим Sentinel (HA)
            this.#redis = new Redis({ sentinels, name: cfg.masterName, ...baseOptions });
        } else {
            // Прямое подключение (локальная разработка)
            this.#redis = new Redis({
                host: cfg.directHost || '127.0.0.1',
                port: Number(cfg.directPort) || 6379,
                ...baseOptions,
            });
        }

        // Гасим события error, чтобы ioredis не бросал unhandled при отсутствии Redis
        this.#redis.on('error', () => {});

        try {
            await this.#redis.connect();
            modules.logger?.info('Redis подключён');
        } catch (e) {
            modules.logger?.warn('Redis недоступен, кэш работает в degraded-режиме: ' + (e as Error).message);
        }
    }

    protected async stopFunction(): Promise<void> {
        if (this.#redis) {
            try {
                await this.#redis.quit();
            } catch {
                /* ignore */
            }
            this.#redis = null;
            modules.logger?.info('Redis отключён');
        }
    }

    async get(key: string): Promise<string | null> {
        try {
            return await this.#redis!.get(key);
        } catch (e) {
            modules.logger?.warn('Cache.get error: ' + (e as Error).message);
            return null;
        }
    }

    async set(key: string, value: string | object, ttl: number | null = null): Promise<void> {
        try {
            const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
            if (ttl) await this.#redis!.set(key, serialized, 'EX', ttl);
            else await this.#redis!.set(key, serialized);
        } catch (e) {
            modules.logger?.warn('Cache.set error: ' + (e as Error).message);
        }
    }

    async getJson<T = unknown>(key: string): Promise<T | null> {
        const val = await this.get(key);
        if (!val) return null;
        try {
            return JSON.parse(val) as T;
        } catch {
            return null;
        }
    }

    async del(key: string): Promise<void> {
        try {
            await this.#redis!.del(key);
        } catch (e) {
            modules.logger?.warn('Cache.del error: ' + (e as Error).message);
        }
    }

    /** Атомарно увеличивает значение ключа на 1, возвращает новое значение */
    async incr(key: string): Promise<number | null> {
        try {
            return await this.#redis!.incr(key);
        } catch (e) {
            modules.logger?.warn('Cache.incr error: ' + (e as Error).message);
            return null;
        }
    }

    /** SET если ключ не существует (атомарно). Возвращает true, если ключ был установлен */
    async setnx(key: string, value: string | number, ttl: number | null = null): Promise<boolean> {
        try {
            let result: string | null;
            if (ttl) result = await this.#redis!.set(key, String(value), 'EX', ttl, 'NX');
            else result = await this.#redis!.set(key, String(value), 'NX');
            return result === 'OK';
        } catch (e) {
            modules.logger?.warn('Cache.setnx error: ' + (e as Error).message);
            return false;
        }
    }

    /** Установить TTL на существующий ключ */
    async expire(key: string, ttl: number): Promise<void> {
        try {
            await this.#redis!.expire(key, ttl);
        } catch (e) {
            modules.logger?.warn('Cache.expire error: ' + (e as Error).message);
        }
    }

    async exists(key: string): Promise<boolean> {
        try {
            return (await this.#redis!.exists(key)) === 1;
        } catch {
            return false;
        }
    }

    /**
     * Сырой клиент — ТОЛЬКО когда Redis реально подключён.
     * Без коннекта (degraded) возвращает null: иначе потребители (rate-limit store, socket-adapter)
     * получили бы живой, но неподключённый инстанс с enableOfflineQueue:false и падали бы на первой команде.
     */
    get client(): Redis | null {
        return this.#redis?.status === 'ready' ? this.#redis : null;
    }
}

export default Cache;
