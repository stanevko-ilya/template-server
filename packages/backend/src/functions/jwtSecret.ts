import { randomBytes } from 'node:crypto';

/**
 * Секрет для подписи/проверки JWT.
 *
 * Если JWT_SECRET не задан — НЕ используем предсказуемый публичный дефолт (известный секрет =
 * возможность подделать любой токен). Вместо этого генерируем случайный секрет на процесс:
 * токены, подписанные снаружи, не пройдут проверку, что вынуждает задать реальный JWT_SECRET.
 */
let generatedSecret: string | null = null;
let warned = false;

export function getJwtSecret(): string {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (!generatedSecret) generatedSecret = randomBytes(32).toString('hex');
    return generatedSecret;
}

/**
 * Один раз громко предупреждает, что JWT_SECRET не задан (вызывать при старте
 * там, где включена auth). Пишет в logger, если передан, иначе в консоль.
 */
export function warnNoJwtSecretOnce(logger?: { warn?: (msg: string) => void } | null): void {
    if (process.env.JWT_SECRET || warned) return;
    warned = true;
    const msg = '[auth] JWT_SECRET не задан — токены не будут проверяться корректно. Задайте JWT_SECRET в .env';
    if (logger?.warn) logger.warn(msg);
    else console.warn(msg);
}

export default { getJwtSecret, warnNoJwtSecretOnce };
