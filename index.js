require('./customize');

const fs = require('fs');
const path = require('path');
const delay = require('./functions/asyncDelay');
const modules = require('./modules');

/**
 * @description Приорететная очередь запуска
 * @default ['logger','db']
 */
const priority_launch_queue = [ 'logger', 'db' ];
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
        modules.logger?.error(modules.logger.stringError(e));
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
process.argv.slice(2);
process.argvParsed = {};
for (let i = 0; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    const value = process.argv[i + 1] || true;
    process.argvParsed[key.replace(/^--/, '')] = value;
}

// Подключение глобального конфига (при наличии)
if (fs.existsSync(path.join(__dirname, './config.json')))
    process.globalConfig = require('./config.json');

async function run() {
    await delay(1000);
    await launch(0);
}
run();
