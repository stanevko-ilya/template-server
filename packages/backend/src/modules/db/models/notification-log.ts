import { Schema } from 'mongoose';

// TTL автоудаления старых записей (дней). Настраивается через NOTIFICATION_LOG_TTL_DAYS.
const ttlDays = parseInt(process.env.NOTIFICATION_LOG_TTL_DAYS ?? '') || 90;

const schema = new Schema(
    {
        job_name: { type: String, index: true },
        platform: { type: String, default: null },
        started_at: Date,
        completed_at: Date,
        status: { type: String, default: 'completed' },
        total_sent: { type: Number, default: 0 },
        total_errors: { type: Number, default: 0 },
        duration_ms: { type: Number, default: 0 },
        error_message: { type: String, default: null },
    },
    { versionKey: false },
);

// Автоудаление по TTL + быстрый поиск по времени
schema.index({ completed_at: 1 }, { expireAfterSeconds: ttlDays * 24 * 60 * 60 });

export default schema;
