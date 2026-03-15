function getRandom(min, max, fractionDigits = 0) {
    if (fractionDigits === 0) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    const num = Math.random() * (max - min) + min;
    return +num.toFixed(fractionDigits);
}
module.exports = getRandom;
