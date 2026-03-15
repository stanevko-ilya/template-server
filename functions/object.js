/**
 * @param {*} value
 * @returns {Boolean} true, если значение — простой объект
 */
function isObject(value) {
    return typeof value === 'object' && !Array.isArray(value) && value !== null && value.toString() === '[object Object]';
}

/**
 * Глубокое клонирование объекта
 * @param {Object} obj
 * @returns {Object}
 */
function cloneObject(obj) {
    const new_object = {};
    for (const key in obj) {
        let value = obj[key];
        if (isObject(value)) value = cloneObject(value);
        new_object[key] = value;
    }
    return new_object;
}

/**
 * Глубокое копирование через JSON (работает для сериализуемых данных)
 * @param {*} obj
 * @returns {*}
 */
function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)) }

module.exports = { isObject, cloneObject, deepCopy };
