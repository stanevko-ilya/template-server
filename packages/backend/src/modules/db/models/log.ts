import { Schema } from 'mongoose';

// TTL автоудаления старых логов (дней). Настраивается через LOG_TTL_DAYS.
const ttlDays = parseInt(process.env.LOG_TTL_DAYS ?? '') || 180;

// Схема намеренно не типизируется shared-типом Log: на стороне БД timestamp — Date,
// а shared-тип описывает wire-формат (string) для фронтенда. strict:false оставляет гибкость.
const schema = new Schema(
    {
        level: String,
        message: String,
        timestamp: { type: Date, default: Date.now },
        user_id: { type: Schema.Types.Mixed, default: null },
        requestId: { type: String, default: null },
        module: { type: String, default: null },
        http_method: { type: String, default: null },
        url: { type: String, default: null },
        status_code: { type: Number, default: null },
        duration_ms: { type: Number, default: null },
        request_body: { type: Schema.Types.Mixed, default: null },
        request_query: { type: Schema.Types.Mixed, default: null },
        request_headers: { type: Schema.Types.Mixed, default: null },
        response_body: { type: Schema.Types.Mixed, default: null },
    },
    { versionKey: false, strict: false },
);

// Автоудаление по TTL + быстрый поиск по времени
schema.index({ timestamp: 1 }, { expireAfterSeconds: ttlDays * 24 * 60 * 60 });
schema.index({ level: 1, timestamp: -1 });

export default schema;
