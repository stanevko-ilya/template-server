/** Документ результата фоновой джобы (notification-log). Чистый тип — без mongoose. */
export interface NotificationLog {
    job_name: string;
    platform: string | null;
    started_at: string;
    completed_at: string;
    status: string;
    total_sent: number;
    total_errors: number;
    duration_ms: number;
    error_message: string | null;
}
