/**
 * @description Пример фоновой джобы.
 *
 * Периодически пишет heartbeat в лог. Демонстрирует формат джобы и распределённый
 * лок (при наличии Redis несколько инстансов notifier не выполнят её одновременно).
 * Замените/удалите при создании своих джоб.
 */
module.exports = {
    name: 'heartbeat',
    enabled: true,
    interval_minutes: 5,

    async run(modules, _config) {
        modules.logger?.info(`[notifier] heartbeat: процесс жив (pid ${process.pid})`);
    },
};
