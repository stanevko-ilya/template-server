const crypto = require('crypto');

/**
 * @description Секрет для подписи/проверки JWT.
 *
 * Если JWT_SECRET не задан — НЕ используем предсказуемый публичный дефолт (известный секрет =
 * возможность подделать любой токен). Вместо этого генерируем случайный секрет на процесс:
 * токены, подписанные снаружи, не пройдут проверку, что вынуждает задать реальный JWT_SECRET.
 */
let _generatedSecret = null;
let _warned = false;

function getJwtSecret() {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (!_generatedSecret) _generatedSecret = crypto.randomBytes(32).toString('hex');
    return _generatedSecret;
}

/**
 * @description Один раз громко предупреждает, что JWT_SECRET не задан (вызывать при старте
 * там, где включена auth). Пишет в logger, если передан, иначе в консоль.
 * @param {{ warn?: Function }} [logger]
 */
function warnNoJwtSecretOnce(logger) {
    if (process.env.JWT_SECRET || _warned) return;
    _warned = true;
    const msg = '[auth] JWT_SECRET не задан — токены не будут проверяться корректно. Задайте JWT_SECRET в .env';
    if (logger?.warn) logger.warn(msg); else console.warn(msg);
}

module.exports = { getJwtSecret, warnNoJwtSecretOnce };
