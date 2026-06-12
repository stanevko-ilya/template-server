import { describe, it, expect } from 'vitest';
import generateId from '../../../src/functions/generateId.js';

describe('generateId', () => {
    it('должен вернуть строку из 16 hex-символов', async () => {
        const id = await generateId();
        expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('должен генерировать уникальные ID', async () => {
        const ids = await Promise.all(Array.from({ length: 20 }, () => generateId()));
        const unique = new Set(ids);
        expect(unique.size).toBe(20);
    });

    it('должен повторять генерацию при невалидном ID', async () => {
        let attempt = 0;
        const id = await generateId(() => {
            attempt++;
            return attempt >= 3;
        });
        expect(attempt).toBe(3);
        expect(id).toMatch(/^[0-9a-f]{16}$/);
    });
});
