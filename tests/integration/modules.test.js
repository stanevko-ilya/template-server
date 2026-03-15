// Устанавливаем env до загрузки модулей
process.env.SSL_MODE = 'off';
process.env.API_PORT = '18080';
process.env.SOCKETS_PORT = '18081';

const modules = require('../../modules');

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

    it('SSL запускается в режиме off и имеет статус on', async () => {
        await modules.ssl.start();
        startedModules.push('ssl');
        expect(modules.ssl.getStatus()).toBe('on');
        expect(modules.ssl.getCredentials()).toBeNull();
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

    it('Модули останавливаются корректно', async () => {
        for (const name of [...startedModules].reverse()) {
            await modules[name].stop();
        }
        startedModules.length = 0;

        expect(modules.logger.getStatus()).toBe('off');
        expect(modules.ssl.getStatus()).toBe('off');
        expect(modules.api.getStatus()).toBe('off');
        expect(modules.sockets.getStatus()).toBe('off');
    });
});
