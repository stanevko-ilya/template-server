import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    resolve: {
        alias: {
            // Vitest игнорирует tsconfig paths — мапим shared на исходник явно
            '@template-server/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        testTimeout: 10000,
    },
});
