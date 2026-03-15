require('dotenv').config();

const fs = require('fs');
const path = require('path');
const delay = require('./functions/asyncDelay');
const modules = require('./modules');

/**
 * @description Приорететная очередь запуска
 * @default ['logger','db']
 */
const priority_launch_queue = [ 'logger', 'db', 'ssl' ];
const launch_queue = Object.keys(modules).sort((module1, module2) => {
    const index_module1 = priority_launch_queue.indexOf(module1);
    const index_module2 = priority_launch_queue.indexOf(module2);
    
    if (index_module1 !== -1 && index_module2 !== -1) return index_module1-index_module2;
    return index_module1 !== -1 ? -1 : 1;
});

async function launch(index) {
    const module = launch_queue[index];
    modules.logger?.info('Запуск модуля ' + module);

    let error = false;
    try { await modules[module].start() }
    catch (e) { error = e.message }

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
            case 'off':
                modules.logger?.warn(`Модуль ${module} не запущен`);
            break;

            case 'on':
                modules.logger?.info(`Модуль ${module} запущен`);
            break;

            default:
                await delay(1000);
                await check_status(number+1);
        }
    }

    await check_status(0);

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

// Подключение глобального конфига (при наличии)
if (fs.existsSync(path.join(__dirname, './config.json')))
    process.globalConfig = require('./config.json');

// Graceful shutdown
async function shutdown(signal) {
    modules.logger?.info(`Получен сигнал ${signal}, завершение работы...`);

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
    modules.logger?.error(`Необработанное исключение: ${err.message}`);
    modules.logger?.error(err.stack || '');
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    modules.logger?.error(`Необработанный промис: ${reason}`);
    process.exit(1);
});

async function run() {
    await delay(1000);
    await launch(0);
}
run();
