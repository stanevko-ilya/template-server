import type { LogLevel } from '@template-server/shared';

export interface LoggerConfig {
    UTC: boolean;
    directory: string;
    format: {
        file_name: string;
        file_extension: string;
        log: string;
    };
    json_format: boolean;
    save_logs: number;
    db_enabled: boolean;
    db_levels: LogLevel[];
    db_batch_size: number;
    db_flush_interval_ms: number;
}

const config = {
    UTC: false,
    directory: './logs',
    format: {
        file_name: '%DD%.%MM%.%YYYY%',
        file_extension: 'log',
        log: '[%level%][%HH%:%MM%:%SS%]%text%',
    },
    json_format: false,
    save_logs: 180,

    // Mongo-сток логгера (опционально). Включается LOGGER_DB_ENABLED=true.
    db_enabled: process.env.LOGGER_DB_ENABLED === 'true',
    db_levels: ['warn', 'error'],
    db_batch_size: 50,
    db_flush_interval_ms: 2000,
} satisfies LoggerConfig;

export default config;
