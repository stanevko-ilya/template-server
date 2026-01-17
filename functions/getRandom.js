function getRandom(min, max, fractionDigits=0) {
    const num = Math.random()*(max - min + 1) + min;
    const roud = +num.toFixed(fractionDigits);
    return roud;
}
module.exports = getRandom;