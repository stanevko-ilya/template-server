/** true, если значение — простой объект */
export function isObject(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        value !== null &&
        Object.prototype.toString.call(value) === '[object Object]'
    );
}

/** Глубокое клонирование объекта */
export function cloneObject<T extends Record<string, unknown>>(obj: T): T {
    const newObject: Record<string, unknown> = {};
    for (const key in obj) {
        let value: unknown = obj[key];
        if (isObject(value)) value = cloneObject(value);
        newObject[key] = value;
    }
    return newObject as T;
}

/** Глубокое копирование через JSON (работает для сериализуемых данных) */
export function deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T;
}

export default { isObject, cloneObject, deepCopy };
