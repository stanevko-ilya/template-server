/**
 * 
 * @param {Number} number Число
 * @param {[String]} txt [Именительный, единственное; Родительный, единственное; Именительный, множественное]
 * @returns окончание
 */
function sklonenie(number, txt) {
    var cases = [2, 0, 1, 1, 1, 2];
    return txt[(number % 100 > 4 && number % 100 < 20) ? 2 : cases[(number % 10 < 5) ? number % 10 : 5]];
}

module.exports = sklonenie;