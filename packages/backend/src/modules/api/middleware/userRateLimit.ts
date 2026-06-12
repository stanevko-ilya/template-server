import { rateLimit, type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { Request } from 'express';

import modules from '../../../modules.js';

/**
 * Ключ лимитера: идентификатор пользователя из JWT (sub / id / user_id), иначе IP.
 * jwt.decode не верифицирует подпись и возвращает null на мусоре (id-ветка тогда не сработает).
 */
export function keyGenerator(req: Request): string {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
        const payload = jwt.decode(auth.slice(7)) as JwtPayload | null;
        const id = payload && (payload.sub ?? payload.id ?? payload.user_id);
        if (id != null) return `u:${id}`;
    }
    return `ip:${req.ip}`;
}

export interface UserRateLimitConfig {
    windowMs?: number;
    max?: number;
}

/**
 * Per-user rate limit. Ключ — идентификатор пользователя из JWT (sub / id / user_id), иначе IP.
 * При наличии Redis использует распределённый стор (rate-limit-redis), иначе in-memory.
 */
export function getUserRateLimit(config: UserRateLimitConfig = {}) {
    const options: Partial<Options> = {
        windowMs: config.windowMs || 1000,
        max: config.max || 40,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator,
    };

    const redisClient = modules.cache?.client;
    if (redisClient) {
        try {
            options.store = new RedisStore({
                sendCommand: (...args: string[]): any => redisClient.call(...(args as [string, ...string[]])),
                prefix: 'rl:user:',
            });
        } catch {
            // rate-limit-redis недоступен — остаёмся на in-memory сторе
        }
    }

    return rateLimit(options);
}

export default getUserRateLimit;
