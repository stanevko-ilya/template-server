const fs = require('fs');
const path = require('path');

/**
 * @param {String} directory_path Путь к папке для перебора
 * @param {Function} callback Функция, в которой будет выполнена работа с найденным файлом
 * @param {String} file_name Название искомого файла
 * @param {Boolean} deep Если true — продолжать спуск в подкаталоги даже после нахождения файла
 *                       (нужно для вложенных маршрутов/конфигов). По умолчанию false — обратная совместимость.
 * @description Перебирает каталог (и подкаталоги) и вызывает callback для каждого найденного файла
 */
function func(directory_path, callback = (_file_path) => {}, file_name = 'index.js', deep = false) {
    const file_path = path.join(directory_path, file_name);

    if (fs.existsSync(file_path)) {
        callback(file_path);
        if (!deep) return;
    }

    fs.readdirSync(directory_path, { withFileTypes: true })
        .filter(el => el.isDirectory())
        .forEach(dir => func(path.join(directory_path, dir.name), callback, file_name, deep));
}

module.exports = func;
