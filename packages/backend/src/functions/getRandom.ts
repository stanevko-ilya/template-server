export function getRandom(min: number, max: number, fractionDigits = 0): number {
    if (fractionDigits === 0) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    const num = Math.random() * (max - min) + min;
    return +num.toFixed(fractionDigits);
}

export default getRandom;
