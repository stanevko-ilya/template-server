/**
 * @param {Number} num Число
 * @returns {String} Число с ведущим нулём для однозначных (7 → "07")
 */
function toStringWithZeros(num) {
    return Number.isInteger(num) && 0 <= num && num < 10 ? `0${num}` : String(num);
}

module.exports = { toStringWithZeros };
