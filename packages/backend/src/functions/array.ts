import { isObject, cloneObject } from './object.js';

export function isEmpty(arr: unknown[]): boolean {
    return arr.length === 0;
}

/** Fisher-Yates shuffle (мутирует массив) */
export function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** Глубокое клонирование массива */
export function cloneArray(arr: unknown[]): unknown[] {
    const newArr: unknown[] = [];
    arr.forEach((value, index) => {
        if (value instanceof Object) {
            value = Array.isArray(value) ? cloneArray(value) : isObject(value) ? cloneObject(value) : value;
        }
        newArr[index] = value;
    });
    return newArr;
}

/** Проверяет, что все элементы targetArr присутствуют в arr */
export function target(arr: unknown[], targetArr: unknown[]): boolean {
    return targetArr.every((element) => arr.includes(element));
}

/** Глубокое сравнение двух массивов (без учёта порядка) */
export function equal(arr1: unknown[], arr2: unknown[]): boolean {
    return target(arr1, arr2) && target(arr2, arr1);
}

/** Вычисляет максимальную глубину вложенности */
export function getDepth(arr: unknown): number {
    if (!Array.isArray(arr)) return 0;
    return 1 + Math.max(0, ...arr.map((item) => getDepth(item)));
}

export default { isEmpty, shuffle, cloneArray, target, equal, getDepth };
