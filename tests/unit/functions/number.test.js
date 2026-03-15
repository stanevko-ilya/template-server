const { toStringWithZeros } = require('../../../functions/number');

describe('toStringWithZeros', () => {
    it('должен добавить ведущий ноль для однозначных чисел', () => {
        expect(toStringWithZeros(0)).toBe('00');
        expect(toStringWithZeros(5)).toBe('05');
        expect(toStringWithZeros(9)).toBe('09');
    });

    it('не должен добавлять ноль для двузначных чисел', () => {
        expect(toStringWithZeros(10)).toBe('10');
        expect(toStringWithZeros(99)).toBe('99');
    });

    it('не должен добавлять ноль для дробных чисел', () => {
        expect(toStringWithZeros(5.5)).toBe('5.5');
    });
});
