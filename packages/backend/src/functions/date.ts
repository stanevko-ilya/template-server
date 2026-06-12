import { toStringWithZeros } from './number.js';

/**
 * @param date Дата
 * @param year Включать ли год
 * @returns "DD.MM" или "DD.MM.YYYY"
 */
export function toShortDate(date: Date, year = false): string {
    let str = `${toStringWithZeros(date.getDate())}.${toStringWithZeros(date.getMonth() + 1)}`;
    if (year) str += `.${date.getFullYear()}`;
    return str;
}

/** Конвертирует дату в UTC+0 (мутирует объект) */
export function toUTCZone(date: Date): Date {
    date.setTime(date.getTime() + date.getTimezoneOffset() * 6e4);
    return date;
}

export function isValid(date: Date): boolean {
    return !Number.isNaN(date.getTime());
}

/** @returns "DD.MM.YYYY HH:MM" */
export function toTimeDate(date: Date): string {
    return `${toShortDate(date, true)} ${toStringWithZeros(date.getHours())}:${toStringWithZeros(date.getMinutes())}`;
}

export default { toShortDate, toUTCZone, isValid, toTimeDate };
