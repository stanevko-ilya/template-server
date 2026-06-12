import { describe, it, expect } from 'vitest';
import { isEmpty, shuffle, cloneArray, target, equal, getDepth } from '../../../src/functions/array.js';

describe('array utilities', () => {
    describe('isEmpty', () => {
        it('должен вернуть true для пустого массива', () => {
            expect(isEmpty([])).toBe(true);
        });
        it('должен вернуть false для непустого массива', () => {
            expect(isEmpty([1])).toBe(false);
        });
    });

    describe('shuffle', () => {
        it('должен сохранить все элементы', () => {
            const arr = [1, 2, 3, 4, 5];
            const shuffled = shuffle([...arr]);
            expect(shuffled.sort()).toEqual(arr.sort());
        });
        it('должен мутировать оригинальный массив', () => {
            const arr = [1, 2, 3, 4, 5];
            const ref = arr;
            shuffle(arr);
            expect(ref).toBe(arr);
        });
    });

    describe('cloneArray', () => {
        it('должен создать глубокую копию', () => {
            const original = [1, [2, 3], { a: 4 }];
            const cloned = cloneArray(original);
            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned[1]).not.toBe(original[1]);
        });
    });

    describe('target', () => {
        it('должен вернуть true, если все элементы присутствуют', () => {
            expect(target([1, 2, 3, 4], [2, 3])).toBe(true);
        });
        it('должен вернуть false, если элемент отсутствует', () => {
            expect(target([1, 2, 3], [2, 5])).toBe(false);
        });
    });

    describe('equal', () => {
        it('должен вернуть true для одинаковых массивов', () => {
            expect(equal([1, 2, 3], [3, 2, 1])).toBe(true);
        });
        it('должен вернуть false для разных массивов', () => {
            expect(equal([1, 2], [1, 2, 3])).toBe(false);
        });
    });

    describe('getDepth', () => {
        it('должен вернуть 1 для плоского массива', () => {
            expect(getDepth([1, 2, 3])).toBe(1);
        });
        it('должен вернуть корректную глубину для вложенных', () => {
            expect(getDepth([1, [2, [3]]])).toBe(3);
        });
        it('должен вернуть 0 для не-массива', () => {
            expect(getDepth(42)).toBe(0);
        });
    });
});
