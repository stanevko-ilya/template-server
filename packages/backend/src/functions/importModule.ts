import { pathToFileURL } from 'node:url';

/**
 * Расширение исходников в текущем рантайме:
 *   - '.ts' под `tsx` (dev) — на диске лежат .ts-файлы;
 *   - '.js' под скомпилированным `dist` (prod) — на диске .js-файлы.
 * Вычисляется из имени текущего модуля (import.meta.filename).
 */
export function runtimeExt(metaFilename: string): '.ts' | '.js' {
    return metaFilename.endsWith('.ts') ? '.ts' : '.js';
}

/**
 * Динамический импорт default-экспорта по абсолютному пути.
 * pathToFileURL ОБЯЗАТЕЛЕН на Windows: сырой путь с буквой диска (D:\...) бросает
 * ERR_UNSUPPORTED_ESM_URL_SCHEME в dynamic import().
 */
export async function importDefault<T>(absPath: string): Promise<T> {
    const mod = (await import(pathToFileURL(absPath).href)) as { default: T };
    return mod.default;
}
