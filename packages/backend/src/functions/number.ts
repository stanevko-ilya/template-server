/**
 * @param num Число
 * @returns Число с ведущим нулём для однозначных (7 → "07")
 */
export function toStringWithZeros(num: number): string {
    return Number.isInteger(num) && num >= 0 && num < 10 ? `0${num}` : String(num);
}

export default { toStringWithZeros };
