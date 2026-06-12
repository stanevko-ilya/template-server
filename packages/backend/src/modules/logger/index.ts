import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Model } from 'mongoose';

import { Module } from '../_class.js';
import config, { type LoggerConfig } from './config.js';
import type { LogLevel } from '@template-server/shared';

/** Доп. поля лога: трассировка, HTTP-контекст, force-запись в БД */
export interface LogExtra {
    requestId?: string | null;
    toDB?: boolean;
    module?: string | null;
    http_method?: string | null;
    url?: string | null;
    status_code?: number | null;
    duration_ms?: number | null;
    request_body?: unknown;
    request_query?: unknown;
    request_headers?: Record<string, string> | null;
    response_body?: unknown;
}

/**
 * Логгер с двумя стоками:
 *   1. Файловый (по умолчанию, без зависимостей) — ротация по дате, чистка по возрасту.
 *   2. MongoDB (опционально, флаг config.db_enabled) — буферизованная пакетная запись,
 *      запросные логи + TTL (см. modules/db/models/log.ts).
 * Консоль используется всегда для системных логов; HTTP-логи (extra.requestId) в консоль не дублируются.
 */
export class Logger extends Module<LoggerConfig> {
    #logging = false;

    #stream: fs.WriteStream | null = null;
    #streamDate: string | null = null;

    // --- Mongo-сток ---
    #dbEnabled = false;

    #logModel: Model<any> | null = null;
    #dbReady = false;
    #buffer: Record<string, unknown>[] = [];
    #flushTimer: NodeJS.Timeout | null = null;
    #maxBufferSize = 10000;

    constructor() {
        super(import.meta.dirname, config);
        // Синхронная проверка/создание файла при инициализации
        this.#checkFileSync();
    }

    protected startFunction(): void {
        this.#logging = true;
        this.#dbEnabled = this.getConfig().db_enabled === true;
        void this.#cleanOldLogs();
    }

    protected async stopFunction(): Promise<void> {
        this.#logging = false;

        // Сброс оставшихся логов в БД
        this.#flush();
        if (this.#flushTimer) {
            clearInterval(this.#flushTimer);
            this.#flushTimer = null;
        }

        if (this.#stream) {
            const stream = this.#stream;
            await new Promise<void>((resolve) => stream.end(() => resolve()));
            this.#stream = null;
            this.#streamDate = null;
        }
    }

    /** Формирует имя файла для текущей даты */
    #getFileName(defaultFileName: string | null = null): string {
        if (defaultFileName) return defaultFileName;

        const today = new Date();
        if (this.getConfig().UTC) today.setTime(today.getTime() + today.getTimezoneOffset() * 6e4);

        const prefix = process.env.VITEST ? 'test-' : '';

        return (
            prefix +
            this.getConfig()
                .format.file_name.replace('%DD%', String(today.getDate()).padStart(2, '0'))
                .replace('%D%', String(today.getDate()))
                .replace('%MM%', String(today.getMonth() + 1).padStart(2, '0'))
                .replace('%M%', String(today.getMonth() + 1))
                .replace('%YYYY%', String(today.getFullYear()))
                .replace('%YY%', String(today.getFullYear() % 100).padStart(2, '0')) +
            '.' +
            this.getConfig().format.file_extension
        );
    }

    /** Синхронная проверка файла (только для конструктора) */
    #checkFileSync(): void {
        const directory = path.join(this.getDirname(), this.getConfig().directory);
        fs.mkdirSync(directory, { recursive: true });

        const fileName = this.#getFileName();
        const pathToFile = path.join(directory, fileName);

        if (!fs.existsSync(pathToFile)) {
            try {
                fs.writeFileSync(pathToFile, '[INFO]Файл логирования инициализирован\n', { flag: 'w+' });
            } catch {
                /* ignore */
            }
        }
    }

    /** Получает WriteStream для текущего файла логов */
    #getStream(): fs.WriteStream | null {
        const fileName = this.#getFileName();

        // Если дата сменилась — закрыть старый стрим и открыть новый
        if (this.#stream && this.#streamDate !== fileName) {
            this.#stream.end();
            this.#stream = null;
        }

        if (!this.#stream) {
            const directory = path.join(this.getDirname(), this.getConfig().directory);
            const pathToFile = path.join(directory, fileName);

            if (!fs.existsSync(pathToFile)) {
                try {
                    fs.writeFileSync(pathToFile, '[INFO]Файл логирования инициализирован\n', { flag: 'w+' });
                } catch {
                    return null;
                }
            }

            this.#stream = fs.createWriteStream(pathToFile, { flags: 'a' });
            this.#streamDate = fileName;
        }

        return this.#stream;
    }

    /** Удаляет файлы логов старше save_logs дней */
    async #cleanOldLogs(): Promise<void> {
        const saveDays = this.getConfig().save_logs;
        if (!saveDays || saveDays <= 0) return;

        const directory = path.join(this.getDirname(), this.getConfig().directory);
        const cutoff = Date.now() - saveDays * 24 * 60 * 60 * 1000;

        try {
            const files = await fsp.readdir(directory);
            for (const file of files) {
                const filePath = path.join(directory, file);
                try {
                    const stat = await fsp.stat(filePath);
                    if (stat.mtime.getTime() < cutoff) {
                        await fsp.unlink(filePath);
                    }
                } catch {
                    /* skip */
                }
            }
        } catch {
            /* directory might not exist */
        }
    }

    // ── Mongo-сток ──────────────────────────────────────────────

    /** Нужно ли писать лог в БД */
    #shouldWriteToDb(level: LogLevel, extra: LogExtra): boolean {
        if (extra?.toDB) return true;
        const dbLevels = this.getConfig()?.db_levels || ['warn', 'error'];
        return dbLevels.includes(level);
    }

    /** Сбрасывает буфер логов в БД пакетом */
    #flush(): void {
        if (!this.#dbReady || !this.#logModel || this.#buffer.length === 0) return;

        const batch = this.#buffer.splice(0);
        this.#logModel.insertMany(batch, { ordered: false }).catch((e: Error) => {
            process.stderr.write(`[LOGGER] Ошибка записи логов в БД: ${e.message}\n`);
        });
    }

    /**
     * Подключает логгер к модели БД и запускает периодический сброс буфера.
     * Вызывается из entry-point после старта БД (только при db_enabled).
     */

    connectToDb(logModel: Model<any>): void {
        this.#logModel = logModel;
        this.#dbReady = true;

        const flushInterval = this.getConfig()?.db_flush_interval_ms || 2000;
        this.#flushTimer = setInterval(() => this.#flush(), flushInterval);
        this.#flushTimer.unref();

        this.#flush();
    }

    // ── Файловый сток ───────────────────────────────────────────

    /**
     * Пишет запись в файл (и в консоль, если не HTTP-лог)
     * @param silentConsole не дублировать в консоль (для HTTP-трафика)
     */
    #writeToFile(level: LogLevel, message: string[], silentConsole = false): boolean {
        const stream = this.#getStream();
        if (!stream) return false;

        const now = new Date();
        if (this.getConfig().UTC) now.setTime(now.getTime() + now.getTimezoneOffset() * 6e4);

        const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

        // JSON-формат для structured logging
        if (this.getConfig().json_format) {
            const entries = message.map((text) =>
                JSON.stringify({
                    level: level.toUpperCase(),
                    timestamp: now.toISOString(),
                    message: text,
                }),
            );
            const output = entries.join('\n') + '\n';
            stream.write(output);
            if (!silentConsole) consoleFn(output.trimEnd());
            return true;
        }

        // Стандартный текстовый формат
        message[message.length - 1] += '\n';
        const print = message.map((text) =>
            this.getConfig()
                .format.log.replace('%level%', level.toUpperCase())

                .replace('%HH%', String(now.getHours()).padStart(2, '0'))
                .replace('%H%', String(now.getHours()))
                .replace('%MM%', String(now.getMinutes()).padStart(2, '0'))
                .replace('%M%', String(now.getMinutes()))
                .replace('%SS%', String(now.getSeconds()).padStart(2, '0'))
                .replace('%S%', String(now.getSeconds()))

                .replace('%text%', text),
        );
        const output = print.join('\n');
        stream.write(output);
        if (!silentConsole) consoleFn(output.trimEnd());

        return true;
    }

    /**
     * Пишет запись в файл/консоль и (опционально) в БД.
     * @param level Уровень сообщения
     * @param message Сообщение или список сообщений
     * @param user_id ID пользователя (попадает в Mongo-сток)
     * @param extra Доп. поля: { requestId, module, toDB, http_method, url, status_code, ... }
     */
    log(
        level: LogLevel,
        message: string | string[],
        user_id: string | number | null = null,
        extra: LogExtra = {},
    ): boolean {
        const messages = typeof message === 'string' ? [message] : Array.isArray(message) ? message : [String(message)];

        // --- Файловый + консольный сток (по умолчанию) ---
        if (this.#logging) this.#writeToFile(level, messages.slice(), !!extra.requestId);

        // --- Mongo-сток (опционально) ---
        if (this.#dbEnabled && this.#shouldWriteToDb(level, extra)) {
            const doc: Record<string, unknown> = {
                level,
                message: messages.join(' '),
                timestamp: new Date(),
                user_id: user_id ?? null,
                requestId: extra.requestId || null,
                module: extra.module || null,
                http_method: extra.http_method || null,
                url: extra.url || null,
                status_code: extra.status_code || null,
                duration_ms: extra.duration_ms || null,
                request_body: extra.request_body || null,
                request_query: extra.request_query || null,
                request_headers: extra.request_headers || null,
                response_body: extra.response_body || null,
            };

            this.#buffer.push(doc);
            if (this.#dbReady) {
                if (this.#buffer.length >= (this.getConfig().db_batch_size || 50)) this.#flush();
            } else if (this.#buffer.length > this.#maxBufferSize) {
                this.#buffer.shift(); // FIFO-кап до подключения БД
            }
        }

        return true;
    }

    info(message: string | string[], user_id: string | number | null = null, extra: LogExtra = {}): boolean {
        return this.log('info', message, user_id, extra);
    }
    warn(message: string | string[], user_id: string | number | null = null, extra: LogExtra = {}): boolean {
        return this.log('warn', message, user_id, extra);
    }
    error(message: string | string[], user_id: string | number | null = null, extra: LogExtra = {}): boolean {
        return this.log('error', message, user_id, extra);
    }

    /** Возвращает записи из выбранного файла логов */
    async get(fileName: string): Promise<false | string> {
        const extension = this.getConfig().format.file_extension;
        const splited = fileName.split('.');
        if (splited[splited.length - 1] !== extension) fileName += `.${extension}`;

        const directory = path.join(this.getDirname(), this.getConfig().directory);
        const pathToFile = path.join(directory, fileName);

        try {
            return await fsp.readFile(pathToFile, 'utf-8');
        } catch {
            return false;
        }
    }
}

export default Logger;
