import { describe, it, expect } from 'vitest';
import RateLimiter from '../../src/functions/rateLimiter.js';

describe('rateLimiter (token bucket)', () => {
    it('выдаёт токены из запаса мгновенно', async () => {
        const rl = new RateLimiter(1000, 5);
        const start = Date.now();
        for (let i = 0; i < 5; i++) await rl.acquire();
        expect(Date.now() - start).toBeLessThan(50);
    });

    it('троттлит при исчерпании запаса по заданному rps', async () => {
        const rl = new RateLimiter(100, 1); // 100 rps, запас 1
        await rl.acquire(); // мгновенно
        const start = Date.now();
        await rl.acquire(); // должен подождать ~10мс
        expect(Date.now() - start).toBeGreaterThanOrEqual(5);
    });

    it('getRps считает фактическую скорость за окно', async () => {
        const rl = new RateLimiter(10000, 50);
        for (let i = 0; i < 10; i++) await rl.acquire();
        expect(rl.getRps()).toBeGreaterThan(0);
    });
});
