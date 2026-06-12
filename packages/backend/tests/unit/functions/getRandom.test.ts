import { describe, it, expect } from 'vitest';
import getRandom from '../../../src/functions/getRandom.js';

describe('getRandom', () => {
    it('должен вернуть число в заданном диапазоне', () => {
        for (let i = 0; i < 100; i++) {
            const result = getRandom(1, 10);
            expect(result).toBeGreaterThanOrEqual(1);
            expect(result).toBeLessThanOrEqual(10);
        }
    });

    it('должен вернуть целое число по умолчанию', () => {
        const result = getRandom(1, 100);
        expect(Number.isInteger(result)).toBe(true);
    });

    it('должен поддерживать десятичные знаки', () => {
        const result = getRandom(1, 10, 2);
        const decimals = result.toString().split('.')[1];
        expect(!decimals || decimals.length <= 2).toBe(true);
    });
});
