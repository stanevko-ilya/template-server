/**
 * @description Переиспользуемые схемы ответов для Swagger.
 *
 * Регистрируйте здесь схемы в объекте `schemas` и ссылайтесь на них из config.json метода:
 *   "response": { "ref": "ItemList" }
 * Хелперы paginated / paginatedHasMore покрывают два частых паттерна пагинации.
 */

/**
 * Пагинация с полным count (для небольших коллекций)
 */
function paginated(itemSchema, totalExample = 1) {
    return {
        type: 'object',
        properties: {
            items: { type: 'array', items: itemSchema },
            total: { type: 'integer', example: totalExample },
        },
    };
}

/**
 * Пагинация без count — флаг has_more (для больших коллекций, без countDocuments)
 */
function paginatedHasMore(itemSchema) {
    return {
        type: 'object',
        properties: {
            items: { type: 'array', items: itemSchema },
            has_more: { type: 'boolean', example: false },
        },
    };
}

/**
 * Именованные схемы ответов. Пусто по умолчанию — добавляйте свои.
 * Пример:
 *   const Item = { type: 'object', properties: { id: { type: 'string' } } };
 *   const schemas = { ItemList: paginatedHasMore(Item) };
 */
const schemas = {};

module.exports = { schemas, paginated, paginatedHasMore };
