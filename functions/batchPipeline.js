/**
 * @description Движок массовой рассылки / пакетной обработки
 *
 * Принимает сгруппированные данные, нарезает в батчи заданного размера
 * и отправляет с rate limiting и пулом параллельных запросов.
 * Каждый батч получает свой рандомный шаблон из массива.
 */

const { renderTemplate } = require('./pluralize');
const delay = require('./asyncDelay');

/**
 * @description Отправляет батч с ретраями через rate limiter.
 * Каждая попытка (включая ретраи) забирает токен из rateLimiter — так реальный RPS не превышает лимит.
 * Между попытками — exponential backoff (1с, 2с, 4с...). Ошибки с e.noRetry=true не ретраятся.
 *
 * @returns {Promise<{sent: number}>} Результат последней успешной попытки
 * @throws {Error} Если все попытки исчерпаны
 */
async function sendBatchWithRetry(batch, message, sendBatch, rateLimiter, maxRetries) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await rateLimiter.acquire();
        try {
            return await sendBatch(batch, message);
        } catch (e) {
            lastError = e;
            if (e.noRetry || attempt === maxRetries) throw e;
            await delay(1000 * (2 ** attempt));
        }
    }
    throw lastError;
}

/**
 * @param {Object} options
 * @param {Map<string, {userIds: number[], templates: string[], count: number, pluralizeConfig: Object}>} options.groups
 * @param {number} options.batchSize - Максимальный размер батча
 * @param {(userIds: number[], message: string) => Promise<any>} options.sendBatch - Функция отправки (одна попытка)
 * @param {import('./rateLimiter')} options.rateLimiter - Rate limiter (токен забирается на каждую попытку, включая ретраи)
 * @param {number} options.concurrency - Макс. параллельных запросов
 * @param {number} options.maxRetries - Макс. количество ретраев при ошибке (0 = без ретраев)
 * @param {((stats: {sent: number, errors: number, elapsed: number}) => void)|null} options.onProgress
 * @param {((err: Error, batchSize: number, batchId: string) => void)|null} options.onError
 * @param {((info: {batchId: string, batchSize: number, rps: number}) => void)|null} options.onBatchStart
 * @param {((info: {batchId: string, sent: number, failed: number, batchSize: number, failedSample: number[]}) => void)|null} options.onBatchDone
 * @param {AbortSignal|null} options.signal - Сигнал отмены
 * @returns {Promise<{totalSent: number, totalErrors: number, durationMs: number}>}
 */
async function processBatches({
    groups,
    batchSize,
    sendBatch,
    rateLimiter,
    concurrency = 30,
    maxRetries = 3,
    onProgress = null,
    onError = null,
    onBatchStart = null,
    onBatchDone = null,
    signal = null,
}) {
    const pool = new Set();
    let totalSent = 0;
    let totalErrors = 0;
    let batchCounter = 0;
    const startTime = Date.now();
    let lastProgressAt = 0;

    for (const [, group] of groups) {
        if (signal?.aborted) break;

        const { userIds, templates, count, pluralizeConfig } = group;

        for (let i = 0; i < userIds.length; i += batchSize) {
            if (signal?.aborted) break;

            const batch = userIds.slice(i, i + batchSize);
            const batchId = `b${(++batchCounter).toString(36)}`;

            // Рандомный шаблон для каждого батча
            const template = templates[Math.floor(Math.random() * templates.length)];
            const message = renderTemplate(template, count, pluralizeConfig);

            if (onBatchStart) {
                onBatchStart({
                    batchId,
                    batchSize: batch.length,
                    rps: typeof rateLimiter?.getRps === 'function' ? rateLimiter.getRps() : 0,
                });
            }

            const promise = sendBatchWithRetry(batch, message, sendBatch, rateLimiter, maxRetries)
                .then((result) => {
                    const sent = result?.sent ?? batch.length;
                    const failed = batch.length - sent;
                    totalSent += sent;
                    totalErrors += failed;

                    if (onBatchDone) {
                        onBatchDone({
                            batchId,
                            sent,
                            failed,
                            batchSize: batch.length,
                            failedSample: Array.isArray(result?.failed) ? result.failed : [],
                        });
                    }
                })
                .catch((e) => {
                    totalErrors += batch.length;
                    onError?.(e, batch.length, batchId);
                })
                .finally(() => {
                    pool.delete(promise);

                    if (onProgress && totalSent + totalErrors - lastProgressAt >= 10000) {
                        lastProgressAt = totalSent + totalErrors;
                        onProgress({ sent: totalSent, errors: totalErrors, elapsed: Date.now() - startTime });
                    }
                });

            pool.add(promise);

            if (pool.size >= concurrency) {
                await Promise.race(pool);
            }
        }
    }

    await Promise.all(pool);

    const durationMs = Date.now() - startTime;

    if (onProgress) {
        onProgress({ sent: totalSent, errors: totalErrors, elapsed: durationMs });
    }

    return { totalSent, totalErrors, durationMs };
}

/**
 * @description Группирует элементы по имени и точному count для персонализации сообщений
 *
 * Каждая группа хранит templates + count — рандомный выбор шаблона происходит в processBatches per-batch.
 *
 * @param {Array<{user_id: number, count: number}>} usersWithCounts
 * @param {Map<number, string|null>} namesMap - Карта user_id → name
 * @param {string[]} templates - Массив шаблонов
 * @param {Object} pluralizeConfig - Конфиг склонений
 * @returns {Map<string, {userIds: number[], templates: string[], count: number, pluralizeConfig: Object}>}
 */
function groupByNameAndCount(usersWithCounts, namesMap, templates, pluralizeConfig) {
    const groups = new Map();

    for (const { user_id, count } of usersWithCounts) {
        const name = namesMap.get(user_id) || null;

        // Группируем по имени + точному count
        const groupKey = `${name || '__no_name__'}|${count}`;

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                userIds: [],
                templates,
                count,
                pluralizeConfig,
            });
        }

        groups.get(groupKey).userIds.push(user_id);
    }

    return groups;
}

/**
 * @description Подтягивает имена пользователей из БД порционно
 *
 * @param {number[]} userIds
 * @param {string} platform
 * @param {import('mongoose').Model} UserModel
 * @param {number} chunkSize
 * @returns {Promise<Map<number, string|null>>}
 */
async function fetchNamesMap(userIds, platform, UserModel, chunkSize = 5000) {
    const namesMap = new Map();

    for (let i = 0; i < userIds.length; i += chunkSize) {
        const chunk = userIds.slice(i, i + chunkSize);
        const users = await UserModel.find(
            { platform, user_id: { $in: chunk } },
            { user_id: 1, name: 1 }
        ).read('secondaryPreferred').lean();

        for (const u of users) {
            namesMap.set(u.user_id, u.name || null);
        }
    }

    return namesMap;
}

module.exports = { processBatches, groupByNameAndCount, fetchNamesMap, sendBatchWithRetry };
