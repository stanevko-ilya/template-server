import fs from 'node:fs';
import path from 'node:path';

/**
 * Рекурсивно перебирает каталог и возвращает пути всех найденных файлов с именем fileName.
 * Синхронный обход ФС; вызывающий код затем делает `await import()` по этим путям.
 *
 * @param directoryPath Путь к папке для перебора
 * @param fileName Название искомого файла (например 'index.js' или 'config.ts')
 * @param deep Если true — продолжать спуск в подкаталоги даже после нахождения файла
 *             (нужно для вложенных маршрутов/конфигов). По умолчанию false.
 * @returns Список абсолютных путей найденных файлов
 */
export function directorySearch(directoryPath: string, fileName = 'index.js', deep = false): string[] {
    const found: string[] = [];

    const walk = (dir: string): void => {
        const filePath = path.join(dir, fileName);
        if (fs.existsSync(filePath)) {
            found.push(filePath);
            if (!deep) return;
        }
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) walk(path.join(dir, entry.name));
        }
    };

    if (fs.existsSync(directoryPath)) walk(directoryPath);
    return found;
}

export default directorySearch;
