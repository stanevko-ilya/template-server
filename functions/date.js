const { toStringWithZeros } = require('./number');

/**
 * @param {Date} date
 * @param {Boolean} year Включать ли год
 * @returns {String} "DD.MM" или "DD.MM.YYYY"
 */
function toShortDate(date, year = false) {
    let str = `${toStringWithZeros(date.getDate())}.${toStringWithZeros(date.getMonth() + 1)}`;
    if (year) str += `.${date.getFullYear()}`;
    return str;
}

/**
 * Конвертирует дату в UTC+0 (мутирует объект)
 * @param {Date} date
 * @returns {Date}
 */
function toUTCZone(date) {
    date.setTime(date.getTime() + date.getTimezoneOffset() * 6e4);
    return date;
}

/**
 * @param {Date} date
 * @returns {Boolean}
 */
function isValid(date) { return !isNaN(date) }

/**
 * @param {Date} date
 * @returns {String} "DD.MM.YYYY HH:MM"
 */
function toTimeDate(date) {
    return `${toShortDate(date, true)} ${toStringWithZeros(date.getHours())}:${toStringWithZeros(date.getMinutes())}`;
}

module.exports = { toShortDate, toUTCZone, isValid, toTimeDate };
