/**
 * @description Общие хелперы фоновых джоб: дедупликация отправок через Redis-сет
 * и запись результата в notification-log.
 */

/** Ключ даты в МСК (YYYY-MM-DD) — для суточных Redis-сетов дедупликации */
function getMskDateKey(offsetHours = 3) {
    const msk = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
    return msk.toISOString().slice(0, 10);
}

/**
 * Отфильтровывает id, которым уведомление уже отправлено (есть в Redis-сете).
 * @returns {Promise<Array>} ещё не уведомлённые id
 */
async function filterNotSent(modules, redisSetKey, userIds) {
    if (!modules.cache?.client || userIds.length === 0) return userIds;

    const pipeline = modules.cache.client.pipeline();
    for (const id of userIds) pipeline.sismember(redisSetKey, String(id));
    const results = await pipeline.exec();

    return userIds.filter((_, i) => !results[i][1]);
}

/** Помечает id как уведомлённых (Redis-сет с TTL 24ч) */
async function markSent(modules, redisSetKey, userIds) {
    if (!modules.cache?.client || userIds.length === 0) return;

    const pipeline = modules.cache.client.pipeline();
    for (const id of userIds) pipeline.sadd(redisSetKey, String(id));
    pipeline.expire(redisSetKey, 86400);
    await pipeline.exec();
}

/** Запись результата джобы в notification-log (no-op, если модели нет) */
async function saveNotificationLog(modules, jobName, platform, { startedAt, totalSent, totalErrors, errors }) {
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

module.exports = { getMskDateKey, filterNotSent, markSent, saveNotificationLog };
