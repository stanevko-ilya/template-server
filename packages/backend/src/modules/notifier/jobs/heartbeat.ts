import type { NotifierJob } from '../index.js';

/**
 * Пример фоновой джобы.
 *
 * Периодически пишет heartbeat в лог. Демонстрирует формат джобы и распределённый
 * лок (при наличии Redis несколько инстансов notifier не выполнят её одновременно).
 * Замените/удалите при создании своих джоб.
 */
const job: NotifierJob = {
    name: 'heartbeat',
    enabled: true,
    interval_minutes: 5,

    run(modules) {
        modules.logger?.info(`[notifier] heartbeat: процесс жив (pid ${process.pid})`);
    },
};

export default job;
