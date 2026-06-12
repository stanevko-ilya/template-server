import { describe, it, expect } from 'vitest';
import { isObject, cloneObject, deepCopy } from '../../../src/functions/object.js';

describe('object utilities', () => {
    describe('isObject', () => {
        it('должен вернуть true для простого объекта', () => {
            expect(isObject({})).toBe(true);
            expect(isObject({ a: 1 })).toBe(true);
        });
        it('должен вернуть false для массивов, null, Date', () => {
            expect(isObject([])).toBe(false);
            expect(isObject(null)).toBe(false);
            expect(isObject(new Date())).toBe(false);
            expect(isObject('string')).toBe(false);
        });
    });

    describe('cloneObject', () => {
        it('должен создать глубокую копию', () => {
            const original = { a: 1, b: { c: 2 } };
            const cloned = cloneObject(original);
            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned.b).not.toBe(original.b);
        });
    });

    describe('deepCopy', () => {
        it('должен скопировать через JSON', () => {
            const original = { a: [1, 2], b: { c: 3 } };
            const copy = deepCopy(original);
            expect(copy).toEqual(original);
            expect(copy).not.toBe(original);
        });
    });
});
