/**
 * Движок массовой рассылки / пакетной обработки.
 *
 * Принимает сгруппированные данные, нарезает в батчи заданного размера
 * и отправляет с rate limiting и пулом параллельных запросов.
 * Каждый батч получает свой рандомный шаблон из массива.
 */

import type { Model } from 'mongoose';
import { renderTemplate, type PluralForms } from './pluralize.js';
import delay from './asyncDelay.js';
import type RateLimiter from './rateLimiter.js';

export interface SendBatchResult {
    sent?: number;
    failed?: number[];
}

export type SendBatchFn = (userIds: number[], message: string) => Promise<SendBatchResult>;

interface RetryableError extends Error {
    noRetry?: boolean;
}

/**
 * Отправляет батч с ретраями через rate limiter.
 * Каждая попытка (включая ретраи) забирает токен из rateLimiter — так реальный RPS не превышает лимит.
 * Между попытками — exponential backoff (1с, 2с, 4с...). Ошибки с e.noRetry=true не ретраятся.
 */
export async function sendBatchWithRetry(
    batch: number[],
    message: string,
    sendBatch: SendBatchFn,
    rateLimiter: RateLimiter,
    maxRetries: number,
): Promise<SendBatchResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await rateLimiter.acquire();
        try {
            return await sendBatch(batch, message);
        } catch (e) {
            lastError = e;
            if ((e as RetryableError)?.noRetry || attempt === maxRetries) throw e;
            await delay(1000 * 2 ** attempt);
        }
    }
    throw lastError;
}

export interface BatchGroup {
    userIds: number[];
    templates: string[];
    count: number;
    pluralizeConfig: Record<string, PluralForms>;
}

export interface ProcessBatchesOptions {
    groups: Map<string, BatchGroup>;
    batchSize: number;
    sendBatch: SendBatchFn;
    rateLimiter: RateLimiter;
    concurrency?: number;
    maxRetries?: number;
    onProgress?: ((stats: { sent: number; errors: number; elapsed: number }) => void) | null;
    onError?: ((err: Error, batchSize: number, batchId: string) => void) | null;
    onBatchStart?: ((info: { batchId: string; batchSize: number; rps: number }) => void) | null;
    onBatchDone?:
        | ((info: { batchId: string; sent: number; failed: number; batchSize: number; failedSample: number[] }) => void)
        | null;
    signal?: AbortSignal | null;
}

export async function processBatches({
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
}: ProcessBatchesOptions): Promise<{ totalSent: number; totalErrors: number; durationMs: number }> {
    const pool = new Set<Promise<void>>();
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

            const promise: Promise<void> = sendBatchWithRetry(batch, message, sendBatch, rateLimiter, maxRetries)
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
                .catch((e: Error) => {
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
 * Группирует элементы по имени и точному count для персонализации сообщений.
 * Каждая группа хранит templates + count — рандомный выбор шаблона происходит в processBatches per-batch.
 */
export function groupByNameAndCount(
    usersWithCounts: Array<{ user_id: number; count: number }>,
    namesMap: Map<number, string | null>,
    templates: string[],
    pluralizeConfig: Record<string, PluralForms>,
): Map<string, BatchGroup> {
    const groups = new Map<string, BatchGroup>();

    for (const { user_id, count } of usersWithCounts) {
        const name = namesMap.get(user_id) || null;

        // Группируем по имени + точному count
        const groupKey = `${name || '__no_name__'}|${count}`;

        if (!groups.has(groupKey)) {
            groups.set(groupKey, { userIds: [], templates, count, pluralizeConfig });
        }

        groups.get(groupKey)!.userIds.push(user_id);
    }

    return groups;
}

/** Подтягивает имена пользователей из БД порционно */
export async function fetchNamesMap(
    userIds: number[],
    platform: string,

    UserModel: Model<any>,
    chunkSize = 5000,
): Promise<Map<number, string | null>> {
    const namesMap = new Map<number, string | null>();

    for (let i = 0; i < userIds.length; i += chunkSize) {
        const chunk = userIds.slice(i, i + chunkSize);
        const users = (await UserModel.find({ platform, user_id: { $in: chunk } }, { user_id: 1, name: 1 })
            .read('secondaryPreferred')
            .lean()) as Array<{ user_id: number; name?: string | null }>;

        for (const u of users) {
            namesMap.set(u.user_id, u.name || null);
        }
    }

    return namesMap;
}

export default { processBatches, groupByNameAndCount, fetchNamesMap, sendBatchWithRetry };
