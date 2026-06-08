const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const modules = require('../../../modules');

/**
 * @description Ключ лимитера: идентификатор пользователя из JWT (sub / id / user_id), иначе IP.
 * jwt.decode не верифицирует подпись и возвращает null на мусоре (id-ветка тогда не сработает).
 * @param {import('express').Request} req
 * @returns {string} `u:<id>` или `ip:<addr>`
 */
function keyGenerator(req) {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
        const payload = jwt.decode(auth.slice(7));
        const id = payload && (payload.sub ?? payload.id ?? payload.user_id);
        if (id != null) return `u:${id}`;
    }
    return `ip:${req.ip}`;
}

/**
 * @description Per-user rate limit.
 * Ключ — идентификатор пользователя из JWT (sub / id / user_id), иначе IP.
 * При наличии Redis использует распределённый стор (rate-limit-redis), иначе in-memory.
 *
 * @param {{ windowMs?: number, max?: number }} config
 */
function getUserRateLimit(config = {}) {
    const options = {
        windowMs: config.windowMs || 1000,
        max: config.max || 40,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator,
    };

    const redisClient = modules.cache?.client;
    if (redisClient) {
        try {
            const { RedisStore } = require('rate-limit-redis');
            options.store = new RedisStore({
                sendCommand: (...args) => redisClient.call(...args),
                prefix: 'rl:user:',
            });
        } catch (_e) {
            // rate-limit-redis не установлен — остаёмся на in-memory сторе
        }
    }

    return rateLimit(options);
}

module.exports = getUserRateLimit;
module.exports.keyGenerator = keyGenerator;
