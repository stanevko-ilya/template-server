const { Schema } = require('mongoose');

function createTypesValidator(types, canBeNull=false) {
    return {
        type: Schema.Types.Mixed,
        validate: {
            validator: val => {
                const done = types.includes(typeof val) || canBeNull && val == null;
                if (done) return true;
                return types.find(type => {
                    try { return val instanceof type }
                    catch (_e) { /* не является конструктором */ }
                });
            },
            message: `Значение должно быть${canBeNull ? ' null' : ''} или одним из типов: ${types.join(',')}`
        }
    }
}

module.exports = createTypesValidator;