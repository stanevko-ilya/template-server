import 'dotenv/config';

import fs from 'node:fs';
import path from 'node:path';
import delay from './functions/asyncDelay.js';
import modules, { loadModules } from './modules.js';

/**
 * Точка входа процесса API/сокетов.
 * Запускает logger → db → cache → api → sockets. Модули notifier и health
 * запускаются отдельным процессом (notifier.ts).
 */

const priority_launch_queue = ['logger', 'db', 'cache'];
const EXCLUDED_MODULES = ['notifier', 'health'];

/** Подключение Mongo-стока логгера после старта БД (только если включён db_enabled) */
function connectLoggerDb(): void {
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

async function main(): Promise<void> {
    await loadModules();

    const launch_queue = Object.keys(modules)
        .filter((name) => modules[name] !== null && !EXCLUDED_MODULES.includes(name))
        .sort((module1, module2) => {
            const i1 = priority_launch_queue.indexOf(module1);
            const i2 = priority_launch_queue.indexOf(module2);
            if (i1 !== -1 && i2 !== -1) return i1 - i2;
            return i1 !== -1 ? -1 : 1;
        });

    async function launch(index: number): Promise<void> {
        const moduleName = launch_queue[index];

        // Пропускаем модули с use: false в конфиге
        const config = modules[moduleName]?.getConfig?.() as { use?: boolean } | undefined;
        if (config && config.use === false) {
            modules.logger?.info(`Модуль ${moduleName} отключён (use: false)`);
            modules[moduleName] = null;
            if (index + 1 < launch_queue.length) await launch(index + 1);
            return;
        }

        modules.logger?.info('Запуск модуля ' + moduleName);

        let error: string | false = false;
        try {
            await modules[moduleName]?.start();
        } catch (e) {
            error = (e as Error).message;
        }

        if (error) {
            modules.logger?.error(error);
            modules.logger?.error('Ошибка во время запуска модуля ' + moduleName);
            if (priority_launch_queue.indexOf(moduleName) !== -1) return;
        }

        async function check_status(number: number): Promise<void> {
            if (number === 3) {
                modules.logger?.error(`Модуль ${moduleName} не запустился`);
                modules.logger?.warn('> Превышено время ожидания запуска модуля ' + moduleName);
                return;
            }

            const status = modules[moduleName]?.getStatus();
            switch (status) {
                case 'off':
                    modules.logger?.warn(`Модуль ${moduleName} не запущен`);
                    break;
                case 'on':
                    modules.logger?.info(`Модуль ${moduleName} запущен`);
                    break;
                default:
                    await delay(1000);
                    await check_status(number + 1);
            }
        }
        await check_status(0);

        // После запуска БД — подключить Mongo-сток логгера (если включён)
        if (moduleName === 'db') connectLoggerDb();

        const next_index = index + 1;
        if (next_index < launch_queue.length) await launch(next_index);
    }

    // Преобразование параметров запуска
    const args = process.argv.slice(2);
    process.argvParsed = {};
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        const value = args[i + 1] || true;
        process.argvParsed[key.replace(/^--/, '')] = value;
    }

    // Подключение глобального конфига (при наличии) из cwd
    const globalConfigPath = path.join(process.cwd(), 'config.json');
    if (fs.existsSync(globalConfigPath)) {
        try {
            process.globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
        } catch {
            /* игнорируем некорректный config.json */
        }
    }

    // Graceful shutdown
    async function shutdown(signal: string): Promise<void> {
        modules.logger?.info(`Получен сигнал ${signal}, завершение работы...`);

        const reversed = [...launch_queue].reverse();
        for (const name of reversed) {
            try {
                if (modules[name]?.getStatus() === 'on') {
                    await modules[name]?.stop();
                    modules.logger?.info(`Модуль ${name} остановлен`);
                }
            } catch (e) {
                modules.logger?.error(`Ошибка при остановке модуля ${name}: ${(e as Error).message}`);
            }
        }

        process.exit(0);
    }

    const SHUTDOWN_TIMEOUT = 10_000;

    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.on(signal, () => {
            const timer = setTimeout(() => {
                modules.logger?.error('Превышено время ожидания завершения, принудительный выход');
                process.exit(1);
            }, SHUTDOWN_TIMEOUT);
            timer.unref();

            void shutdown(signal);
        });
    }

    process.on('uncaughtException', (err) => {
        modules.logger?.error(`Необработанное исключение: ${err.message}`);
        modules.logger?.error(err.stack || '');
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        modules.logger?.error(`Необработанный промис: ${reason}`);
        process.exit(1);
    });

    await delay(1000);
    await launch(0);
}

void main();
