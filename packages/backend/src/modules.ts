import path from 'node:path';
import { pathToFileURL } from 'node:url';
import directorySearch from './functions/directorySearch.js';
import { runtimeExt } from './functions/importModule.js';
import type { Module } from './modules/_class.js';

import type Logger from './modules/logger/index.js';
import type DB from './modules/db/index.js';
import type Cache from './modules/cache/index.js';
import type API from './modules/api/index.js';
import type Sockets from './modules/sockets/index.js';
import type Notifier from './modules/notifier/index.js';
import type Health from './modules/health/index.js';

/**
 * Реестр модулей-синглтонов. Экспортируется как мутабельный объект (default),
 * который наполняет loadModules(). Модули импортируют этот объект для позднего
 * связывания (modules.logger?.info(...)) — он существует на этапе импорта и
 * мутируется на месте при загрузке.
 *
 * Интерфейс расширяется по мере добавления модулей в следующих этапах.
 */
export interface Modules {
    logger: Logger | null;
    db: DB | null;
    cache: Cache | null;
    api: API | null;
    sockets: Sockets | null;
    notifier: Notifier | null;
    health: Health | null;
    [name: string]: Module | null;
}

const modules: Modules = {
    logger: null,
    db: null,
    cache: null,
    api: null,
    sockets: null,
    notifier: null,
    health: null,
};

let loaded = false;

/** Автообнаружение и инстанцирование всех модулей из ./modules/<name>/index */
export async function loadModules(): Promise<Modules> {
    if (loaded) return modules;

    const ext = runtimeExt(import.meta.filename);
    const indexFiles = directorySearch(path.join(import.meta.dirname, 'modules'), `index${ext}`, false);

    for (const file of indexFiles) {
        const ModuleClass = (await import(pathToFileURL(file).href)).default as new () => Module;
        const name = file.replace(/\\/g, '/').split('/').reverse()[1];
        modules[name] = new ModuleClass();
    }

    loaded = true;
    return modules;
}

export default modules;
