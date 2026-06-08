const mongoose = require('mongoose');

// Устанавливаем env до загрузки модулей
process.env.API_PORT = '18080';
process.env.SOCKETS_PORT = '18081';
process.env.HEALTH_PORT = '18090';
if (!process.env.DB_URL) process.env.DB_URL = 'mongodb://localhost:27017/testdb';

const modules = require('../../modules');

/**
 * Проверяет доступность MongoDB
 */
async function isMongoAvailable() {
    try {
        const conn = await mongoose.createConnection(process.env.DB_URL, {
            serverSelectionTimeoutMS: 3000,
        }).asPromise();
        await conn.close();
        return true;
    } catch (_e) {
        return false;
    }
}

let mongoAvailable = false;

beforeAll(async () => {
    mongoAvailable = await isMongoAvailable();
});

describe('Интеграционный тест модулей', () => {
    const startedModules = [];

    afterAll(async () => {
        // Останавливаем в обратном порядке
        for (const name of [...startedModules].reverse()) {
            try { await modules[name].stop() } catch (_e) { /* ignore */ }
        }
    });

    it('Logger запускается и имеет статус on', async () => {
        await modules.logger.start();
        startedModules.push('logger');
        expect(modules.logger.getStatus()).toBe('on');
    });

    it('DB запускается и имеет статус on (если MongoDB доступна)', async ({ skip }) => {
        if (!mongoAvailable) skip();
        await modules.db.start();
        startedModules.push('db');
        expect(modules.db.getStatus()).toBe('on');
    });

    it('Cache запускается и имеет статус on (degraded без Redis допустим)', async () => {
        await modules.cache.start();
        startedModules.push('cache');
        expect(modules.cache.getStatus()).toBe('on');
    });

    it('API запускается и имеет статус on', async () => {
        await modules.api.start();
        startedModules.push('api');
        expect(modules.api.getStatus()).toBe('on');
    });

    it('Sockets запускается и имеет статус on', async () => {
        await modules.sockets.start();
        startedModules.push('sockets');
        expect(modules.sockets.getStatus()).toBe('on');
    });

    it('Notifier запускается и имеет статус on', async () => {
        await modules.notifier.start();
        startedModules.push('notifier');
        expect(modules.notifier.getStatus()).toBe('on');
    });

    it('Health запускается и имеет статус on', async () => {
        await modules.health.start();
        startedModules.push('health');
        expect(modules.health.getStatus()).toBe('on');
    });

    it('Модули останавливаются корректно', async () => {
        for (const name of [...startedModules].reverse()) {
            await modules[name].stop();
        }

        const expectedOff = ['logger', 'cache', 'api', 'sockets', 'notifier', 'health'];
        if (mongoAvailable) expectedOff.push('db');

        for (const name of expectedOff) {
            expect(modules[name].getStatus()).toBe('off');
        }

        startedModules.length = 0;
    });
});
