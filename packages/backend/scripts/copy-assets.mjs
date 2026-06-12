// Копирует не-TS статику в dist после сборки (tsc их не переносит).
// Сейчас это только статика API (public/index.html). Толерантно: пропускает отсутствующие источники.
import { cp, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(scriptsDir, '..');

const assets = [['src/modules/api/public', 'dist/modules/api/public']];

for (const [from, to] of assets) {
    const src = path.join(backendDir, from);
    const dest = path.join(backendDir, to);
    try {
        await access(src);
        await cp(src, dest, { recursive: true });
        console.log(`[copy-assets] ${from} -> ${to}`);
    } catch {
        // источник отсутствует — пропускаем
    }
}
