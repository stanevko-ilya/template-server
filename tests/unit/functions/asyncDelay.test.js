const delay = require('../../../functions/asyncDelay');

describe('asyncDelay', () => {
    it('должен вернуть промис', () => {
        const result = delay(1);
        expect(result).toBeInstanceOf(Promise);
    });

    it('должен разрешиться после указанного времени', async () => {
        const start = Date.now();
        await delay(50);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(40);
    });
});
