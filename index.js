const ora = require('ora');

require('./customize');
const delay = require('./functions/async_delay');
const modules = require('./modules');

const priority_launch_queue = [ 'logger', 'db' ]; // Приорететная очередь запуска
const launch_queue = Object.keys(modules).sort((module1, module2) => {
    const index_module1 = priority_launch_queue.indexOf(module1);
    const index_module2 = priority_launch_queue.indexOf(module2);
    
    if (index_module1 !== -1 && index_module2 !== -1) return index_module1-index_module2;
    return index_module1 !== -1 ? -1 : 1;
});

async function launch(index) {
    const module = launch_queue[index];
    const indicator = ora('Запуск модуля ' + module);
    indicator.start();

    let error = false;
    try { await modules[module].start() }
    catch (e) { error = e.message }

    if (error) {
        indicator.fail('Ошибка во время запуска модуля ' + module);
        console.log('> Ошибка: ' + error);
        return;
    }

    async function check_status(number) {
        if (number === 3) {
            indicator.fail(`Модуль ${module} не запустился`);
            console.log('> Превышено время ожидания запуска модуля ' + module);
            return;
        }

        const status = modules[module].get_status();
        
        switch (status) {
            case 'off':
                indicator.fail(`Модуль ${module} не запущен`);
            break;

            case 'on':
                indicator.succeed(`Модуль ${module} запущен`);
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

async function run() {
    await delay(1000);
    await launch(0);
}
run();