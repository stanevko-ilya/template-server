const { isObject, cloneObject } = require('./object');

/**
 * @param {Array} arr
 * @returns {Boolean}
 */
function isEmpty(arr) { return arr.length === 0 }

/**
 * Fisher-Yates shuffle (мутирует массив)
 * @param {Array} arr
 * @returns {Array}
 */
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Глубокое клонирование массива
 * @param {Array} arr
 * @returns {Array}
 */
function cloneArray(arr) {
    const new_arr = [];
    arr.forEach((value, index) => {
        if (value instanceof Object) {
            value = Array.isArray(value) ? cloneArray(value) : isObject(value) ? cloneObject(value) : value;
        }
        new_arr[index] = value;
    });
    return new_arr;
}

/**
 * Проверяет, что все элементы targetArr присутствуют в arr
 * @param {Array} arr
 * @param {Array} targetArr
 * @returns {Boolean}
 */
function target(arr, targetArr) { return targetArr.every(element => arr.includes(element)) }

/**
 * Глубокое сравнение двух массивов (без учёта порядка)
 * @param {Array} arr1
 * @param {Array} arr2
 * @returns {Boolean}
 */
function equal(arr1, arr2) { return target(arr1, arr2) && target(arr2, arr1) }

/**
 * Вычисляет максимальную глубину вложенности
 * @param {Array} arr
 * @returns {Number}
 */
function getDepth(arr) {
    if (!Array.isArray(arr)) return 0;
    return 1 + Math.max(0, ...arr.map(item => getDepth(item)));
}

module.exports = { isEmpty, shuffle, cloneArray, target, equal, getDepth };
