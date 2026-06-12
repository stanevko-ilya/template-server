import { describe, it, expect } from 'vitest';
import { toShortDate, toUTCZone, isValid, toTimeDate } from '../../../src/functions/date.js';

describe('date utilities', () => {
    describe('toShortDate', () => {
        it('должен вернуть формат DD.MM', () => {
            const date = new Date(2024, 2, 5); // 5 марта 2024
            expect(toShortDate(date)).toBe('05.03');
        });
        it('должен включить год при year=true', () => {
            const date = new Date(2024, 2, 5);
            expect(toShortDate(date, true)).toBe('05.03.2024');
        });
    });

    describe('isValid', () => {
        it('должен вернуть true для валидной даты', () => {
            expect(isValid(new Date())).toBe(true);
        });
        it('должен вернуть false для невалидной даты', () => {
            expect(isValid(new Date('invalid'))).toBe(false);
        });
    });

    describe('toTimeDate', () => {
        it('должен вернуть формат DD.MM.YYYY HH:MM', () => {
            const date = new Date(2024, 0, 15, 9, 5);
            expect(toTimeDate(date)).toBe('15.01.2024 09:05');
        });
    });

    describe('toUTCZone', () => {
        it('должен вернуть дату (мутирует объект)', () => {
            const date = new Date();
            const result = toUTCZone(date);
            expect(result).toBe(date);
        });
    });
});
