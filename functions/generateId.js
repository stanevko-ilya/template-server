const crypto = require('crypto');

async function generateId(validator=value=>true) {
    const id = crypto.randomBytes(8).toString('hex');
    if (await validator(id)) return id;
    else return await generateId(validator);
}

module.exports = generateId;