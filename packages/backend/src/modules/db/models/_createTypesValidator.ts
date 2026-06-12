import { Schema } from 'mongoose';

type Constructor = new (...args: never[]) => unknown;

/**
 * Валидатор поля Mixed: значение должно быть одного из перечисленных типов
 * (строки typeof — 'string'/'number'/... — или конструкторы для instanceof).
 */
export function createTypesValidator(types: Array<string | Constructor>, canBeNull = false) {
    return {
        type: Schema.Types.Mixed,
        validate: {
            validator: (val: unknown): boolean => {
                const done = types.includes(typeof val) || (canBeNull && val == null);
                if (done) return true;
                return Boolean(
                    types.find((type) => {
                        try {
                            return typeof type !== 'string' && val instanceof type;
                        } catch {
                            return false;
                        }
                    }),
                );
            },
            message: `Значение должно быть${canBeNull ? ' null' : ''} или одним из типов: ${types.join(',')}`,
        },
    };
}

export default createTypesValidator;
