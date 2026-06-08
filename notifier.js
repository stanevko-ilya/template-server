require('dotenv').config();

const delay = require('./functions/asyncDelay');
const modules = require('./modules');

/**
 * @description Entry point процесса фоновых задач.
 * Запускает только: logger → db → cache → notifier (+ health).
 * Модули api и sockets в этом процессе не загружаются.
 */

const EXCLUDED_MODULES = ['api', 'sockets'];
const priority_launch_queue = ['logger', 'db', 'cache'];

const launch_queue = Object.keys(modules)
    .filter(name => !EXCLUDED_MODULES.includes(name))
    .sort((module1, module2) => {
        const index_module1 = priority_launch_queue.indexOf(module1);
        const index_module2 = priority_launch_queue.indexOf(module2);
        if (index_module1 !== -1 && index_module2 !== -1) return index_module1 - index_module2;
        return index_module1 !== -1 ? -1 : 1;
    });

/** Подключение Mongo-стока логгера после старта БД (только если включён db_enabled) */
function connectLoggerDb() {
    if (modules.logger?.getConfig?.()?.db_enabled !== true) return;
    if (!modules.logger?.connectToDb || !modules.db?.models?.['log']) return;

    if (modules.db.logConnection) {
        const logSchema = modules.db.models['log'].schema;
        const logModel = modules.db.logConnection.model('log', logSchema);
        modules.logger.connectToDb(logModel);
    } else {
        modules.logger.connectToDb(modules.db.models['log']);
    }
}

async function launch(index) {
    const module = launch_queue[index];

    // Пропускаем модули с use: false в конфиге
    const config = modules[module]?.getConfig?.();
    if (config && config.use === false) {
        modules.logger?.info(`Модуль ${module} отключён (use: false)`);
        modules[module] = null;
        if (index + 1 < launch_queue.length) await launch(index + 1);
        return;
    }

    modules.logger?.info('[notifier] Запуск модуля ' + module);

    let error = false;
    try { await modules[module].start(); }
    catch (e) { error = e.message; }

    if (error) {
        modules.logger?.error(error);
        modules.logger?.error('Ошибка во время запуска модуля ' + module);
        if (priority_launch_queue.indexOf(module) !== -1) return;
    }

    async function check_status(number) {
        if (number === 3) {
            modules.logger?.error(`Модуль ${module} не запустился`);
            modules.logger?.warn('> Превышено время ожидания запуска модуля ' + module);
            return;
        }

        const status = modules[module].getStatus();
        switch (status) {
            case 'off': modules.logger?.warn(`Модуль ${module} не запущен`); break;
            case 'on': modules.logger?.info(`Модуль ${module} запущен`); break;
            default: await delay(1000); await check_status(number + 1);
        }
    }
    await check_status(0);

    if (module === 'db') connectLoggerDb();

    const next_index = index + 1;
    if (next_index < launch_queue.length) await launch(next_index);
}

// Graceful shutdown
async function shutdown(signal) {
    modules.logger?.info(`[notifier] Получен сигнал ${signal}, завершение работы...`);

    const reversed = [...launch_queue].reverse();
    for (const name of reversed) {
        try {
            if (modules[name]?.getStatus() === 'on') {
                await modules[name].stop();
                modules.logger?.info(`Модуль ${name} остановлен`);
            }
        } catch (e) {
            modules.logger?.error(`Ошибка при остановке модуля ${name}: ${e.message}`);
        }
    }

    process.exit(0);
}

const SHUTDOWN_TIMEOUT = 10_000;

for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
        const timer = setTimeout(() => {
            modules.logger?.error('Превышено время ожидания завершения, принудительный выход');
            process.exit(1);
        }, SHUTDOWN_TIMEOUT);
        timer.unref();

        shutdown(signal);
    });
}

process.on('uncaughtException', (err) => {
    modules.logger?.error(`[notifier] Необработанное исключение: ${err.message}`);
    modules.logger?.error(err.stack || '');
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    modules.logger?.error(`[notifier] Необработанный промис: ${reason}`);
    process.exit(1);
});

async function run() {
    await delay(1000);
    await launch(0);
}
run();
