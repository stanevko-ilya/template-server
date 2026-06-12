import type { LogLevel } from '../enums.js';

/** Документ лога в БД (Mongo-сток логгера). Чистый тип — без mongoose. */
export interface Log {
    level: LogLevel;
    message: string;
    timestamp: string;
    user_id: string | number | null;
    requestId: string | null;
    module: string | null;
    http_method: string | null;
    url: string | null;
    status_code: number | null;
    duration_ms: number | null;
    request_body: unknown;
    request_query: unknown;
    request_headers: Record<string, string> | null;
    response_body: unknown;
}
