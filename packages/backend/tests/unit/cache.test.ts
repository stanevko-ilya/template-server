import { describe, it, expect, beforeAll } from 'vitest';
import modules, { loadModules } from '../../src/modules.js';
import type Cache from '../../src/modules/cache/index.js';

// Кэш не подключён к Redis (startFunction не вызывался) — проверяем graceful-degradation:
// методы не бросают, а возвращают безопасные значения по умолчанию.
describe('cache graceful-degradation (без Redis)', () => {
    let cache: Cache;

    beforeAll(async () => {
        await loadModules();
        cache = modules.cache!;
    });

    it('get возвращает null', async () => {
        expect(await cache.get('any')).toBeNull();
    });
    it('getJson возвращает null', async () => {
        expect(await cache.getJson('any')).toBeNull();
    });
    it('exists возвращает false', async () => {
        expect(await cache.exists('any')).toBe(false);
    });
    it('setnx возвращает false', async () => {
        expect(await cache.setnx('any', '1')).toBe(false);
    });
    it('incr возвращает null', async () => {
        expect(await cache.incr('any')).toBeNull();
    });
    it('set/del не бросают', async () => {
        await expect(cache.set('a', 'b')).resolves.toBeUndefined();
        await expect(cache.del('a')).resolves.toBeUndefined();
    });
});
