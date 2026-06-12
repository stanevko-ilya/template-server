/**
 * Переиспользуемые схемы ответов для Swagger.
 *
 * Регистрируйте здесь схемы в объекте `schemas` и ссылайтесь на них из config.ts метода:
 *   response: { ref: 'ItemList' }
 * Хелперы paginated / paginatedHasMore покрывают два частых паттерна пагинации.
 */

export type OpenApiSchema = Record<string, unknown>;

/** Пагинация с полным count (для небольших коллекций) */
export function paginated(itemSchema: OpenApiSchema, totalExample = 1): OpenApiSchema {
    return {
        type: 'object',
        properties: {
            items: { type: 'array', items: itemSchema },
            total: { type: 'integer', example: totalExample },
        },
    };
}

/** Пагинация без count — флаг has_more (для больших коллекций, без countDocuments) */
export function paginatedHasMore(itemSchema: OpenApiSchema): OpenApiSchema {
    return {
        type: 'object',
        properties: {
            items: { type: 'array', items: itemSchema },
            has_more: { type: 'boolean', example: false },
        },
    };
}

/** Именованные схемы ответов. Пусто по умолчанию — добавляйте свои. */
export const schemas: Record<string, OpenApiSchema> = {};

export default { schemas, paginated, paginatedHasMore };
