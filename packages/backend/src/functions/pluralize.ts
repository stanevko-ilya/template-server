/** Три формы склонения: [1, 2-4, 5+] */
export type PluralForms = [string, string, string];

/**
 * Русское склонение существительного по числительному.
 * @param n Число
 * @param forms Три формы: ["приглашение", "приглашения", "приглашений"]
 */
export function pluralize(n: number, forms: PluralForms): string {
    const abs = Math.abs(n) % 100;
    const lastDigit = abs % 10;

    if (abs > 10 && abs < 20) return forms[2]; // 11-19
    if (lastDigit > 1 && lastDigit < 5) return forms[1]; // 2-4
    if (lastDigit === 1) return forms[0]; // 1
    return forms[2]; // 0, 5-9
}

/**
 * Рендерит шаблон, подставляя {count} и все {count_word*} через pluralize.
 * @param template Шаблон сообщения ("У вас {count} {count_word}")
 * @param count Число для подстановки
 * @param pluralizeConfig Конфиг склонений
 */
export function renderTemplate(template: string, count: number, pluralizeConfig: Record<string, PluralForms>): string {
    let result = template.replace(/\{count\}/g, String(count));

    for (const [key, forms] of Object.entries(pluralizeConfig)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), pluralize(count, forms));
    }

    // Подстановка {name} — пока всегда null, вырезаем
    result = result.replace(/\{name\},?\s*/g, '');
    result = result.replace(/\{name\}/g, '');

    return result;
}

export default { pluralize, renderTemplate };
