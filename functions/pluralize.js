/**
 * @description Русское склонение существительного по числительному
 *
 * @param {number} n - Число
 * @param {[string, string, string]} forms - Три формы: [1, 2-4, 5+]
 *   Примеры: ["приглашение", "приглашения", "приглашений"]
 *            ["друг", "друга", "друзей"]
 * @returns {string} Склонённое слово
 */
function pluralize(n, forms) {
    const abs = Math.abs(n) % 100;
    const lastDigit = abs % 10;

    if (abs > 10 && abs < 20) return forms[2]; // 11-19 → "приглашений"
    if (lastDigit > 1 && lastDigit < 5) return forms[1]; // 2-4 → "приглашения"
    if (lastDigit === 1) return forms[0]; // 1 → "приглашение"
    return forms[2]; // 0, 5-9 → "приглашений"
}

/**
 * @description Рендерит шаблон, подставляя {count} и все {count_word*} через pluralize
 *
 * @param {string} template - Шаблон сообщения (например "У вас {count} {count_word}")
 * @param {number} count - Число для подстановки
 * @param {Object<string, [string, string, string]>} pluralizeConfig - Конфиг склонений
 * @returns {string} Готовое сообщение
 */
function renderTemplate(template, count, pluralizeConfig) {
    let result = template.replace(/\{count\}/g, String(count));

    for (const [key, forms] of Object.entries(pluralizeConfig)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), pluralize(count, forms));
    }

    // Подстановка {name} — пока всегда null, вырезаем
    result = result.replace(/\{name\},?\s*/g, '');
    result = result.replace(/\{name\}/g, '');

    return result;
}

module.exports = { pluralize, renderTemplate };
