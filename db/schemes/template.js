const { Schema } = require('mongoose');

module.exports = Schema({
    key: {
        type: String,
        required: true
    }
}, { versionKey: false });