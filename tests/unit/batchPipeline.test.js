const { processBatches, groupByNameAndCount } = require('../../functions/batchPipeline');
const RateLimiter = require('../../functions/rateLimiter');

function makeGroups(userIds) {
    return new Map([['g', { userIds, templates: ['msg {count}'], count: 1, pluralizeConfig: {} }]]);
}

describe('batchPipeline.processBatches', () => {
    it('рассылает все батчи и считает totalSent', async () => {
        const seen = [];
        const res = await processBatches({
            groups: makeGroups([1, 2, 3, 4, 5]),
            batchSize: 2,
            sendBatch: async (batch) => { seen.push(batch.length); return { sent: batch.length }; },
            rateLimiter: new RateLimiter(100000, 100),
            concurrency: 2,
            maxRetries: 0,
        });
        expect(res.totalSent).toBe(5);
        expect(res.totalErrors).toBe(0);
        expect(seen.reduce((a, b) => a + b, 0)).toBe(5);
    });

    it('ретраит при ошибке и в итоге доставляет', async () => {
        let attempts = 0;
        const res = await processBatches({
            groups: makeGroups([1, 2]),
            batchSize: 2,
            sendBatch: async (batch) => { attempts++; if (attempts === 1) throw new Error('temp'); return { sent: batch.length }; },
            rateLimiter: new RateLimiter(100000, 100),
            concurrency: 1,
            maxRetries: 2,
        });
        expect(res.totalSent).toBe(2);
        expect(attempts).toBe(2);
    });

    it('не ретраит ошибки с noRetry и считает их как errors', async () => {
        let attempts = 0;
        const res = await processBatches({
            groups: makeGroups([1, 2]),
            batchSize: 2,
            sendBatch: async () => { attempts++; const e = new Error('auth'); e.noRetry = true; throw e; },
            rateLimiter: new RateLimiter(100000, 100),
            concurrency: 1,
            maxRetries: 3,
        });
        expect(attempts).toBe(1);
        expect(res.totalErrors).toBe(2);
    });

    it('прекращает рассылку по abort-сигналу', async () => {
        const ac = new AbortController();
        ac.abort();
        const res = await processBatches({
            groups: makeGroups([1, 2, 3]),
            batchSize: 1,
            sendBatch: async (b) => ({ sent: b.length }),
            rateLimiter: new RateLimiter(100000, 100),
            signal: ac.signal,
        });
        expect(res.totalSent).toBe(0);
    });
});

describe('batchPipeline.groupByNameAndCount', () => {
    it('группирует по имени и count', () => {
        const groups = groupByNameAndCount(
            [{ user_id: 1, count: 2 }, { user_id: 2, count: 2 }, { user_id: 3, count: 5 }],
            new Map(),
            ['t'],
            {}
        );
        expect(groups.size).toBe(2);
    });
});
