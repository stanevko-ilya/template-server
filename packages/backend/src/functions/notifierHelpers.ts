/**
 * Общие хелперы фоновых джоб: дедупликация отправок через Redis-сет
 * и запись результата в notification-log.
 */
import type { Modules } from '../modules.js';

/** Ключ даты в МСК (YYYY-MM-DD) — для суточных Redis-сетов дедупликации */
export function getMskDateKey(offsetHours = 3): string {
    const msk = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
    return msk.toISOString().slice(0, 10);
}

/** Отфильтровывает id, которым уведомление уже отправлено (есть в Redis-сете). */
export async function filterNotSent(modules: Modules, redisSetKey: string, userIds: number[]): Promise<number[]> {
    const client = modules.cache?.client;
    if (!client || userIds.length === 0) return userIds;

    const pipeline = client.pipeline();
    for (const id of userIds) pipeline.sismember(redisSetKey, String(id));
    const results = await pipeline.exec();

    return userIds.filter((_, i) => !results?.[i]?.[1]);
}

/** Помечает id как уведомлённых (Redis-сет с TTL 24ч) */
export async function markSent(modules: Modules, redisSetKey: string, userIds: number[]): Promise<void> {
    const client = modules.cache?.client;
    if (!client || userIds.length === 0) return;

    const pipeline = client.pipeline();
    for (const id of userIds) pipeline.sadd(redisSetKey, String(id));
    pipeline.expire(redisSetKey, 86400);
    await pipeline.exec();
}

export interface NotificationLogInput {
    startedAt?: Date;
    totalSent: number;
    totalErrors: number;
    errors?: Set<string>;
}

/** Запись результата джобы в notification-log (no-op, если модели нет) */
export async function saveNotificationLog(
    modules: Modules,
    jobName: string,
    platform: string | null,
    { startedAt, totalSent, totalErrors, errors }: NotificationLogInput,
): Promise<void> {
    const Model = modules.db?.models?.['notification-log'];
    if (!Model) return;

    const started = startedAt || new Date();
    await Model.create({
        job_name: jobName,
        platform,
        started_at: started,
        completed_at: new Date(),
        status: 'completed',
        total_sent: totalSent,
        total_errors: totalErrors,
        duration_ms: Date.now() - started.getTime(),
        error_message: errors && errors.size > 0 ? [...errors].join(' | ') : null,
    });
}

export default { getMskDateKey, filterNotSent, markSent, saveNotificationLog };
