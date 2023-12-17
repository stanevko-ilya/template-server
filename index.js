require('./customize');
const modules = require('./modules');

const priority_launch_queue = [ 'db', 'logger' ]; // Приорететная очередь запуска
const launch_queue = Object.keys(modules).sort((module1, module2) => {
    const index_module1 = priority_launch_queue.indexOf(module1);
    const index_module2 = priority_launch_queue.indexOf(module2);
    
    if (index_module1 !== -1 && index_module2 !== -1) return index_module1-index_module2;
    return index_module1 !== -1 ? -1 : 1;
});

async function launch(index) {
    // TODO: запуск модулей
}
launch(0);