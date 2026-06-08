const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const Module = require('../_class');

/**
 * @description Логгер с двумя стоками:
 *   1. Файловый (по умолчанию, без зависимостей) — ротация по дате, чистка по возрасту.
 *   2. MongoDB (опционально, флаг config.db_enabled) — буферизованная пакетная запись,
 *      запросные логи + TTL (см. modules/db/models/log.js).
 * Консоль используется всегда для системных логов; HTTP-логи (extra.requestId) в консоль не дублируются.
 */
class Logger extends Module {
    /** @returns {typeof import('./config.json')} */
    getConfig() { return super.getConfig(); }

    #logging = false;

    /** @type {fs.WriteStream|null} */
    #stream = null;
    #streamDate = null;

    // --- Mongo-сток ---
    #dbEnabled = false;
    /** @type {import('mongoose').Model|null} */
    #logModel = null;
    #dbReady = false;
    #buffer = [];
    #flushTimer = null;
    #maxBufferSize = 10000;

    startFunction() {
        this.#logging = true;
        this.#dbEnabled = this.getConfig().db_enabled === true;
        this.#cleanOldLogs();
    }

    async stopFunction() {
        this.#logging = false;

        // Сброс оставшихся логов в БД
        this.#flush();
        if (this.#flushTimer) {
            clearInterval(this.#flushTimer);
            this.#flushTimer = null;
        }

        if (this.#stream) {
            await new Promise(resolve => this.#stream.end(resolve));
            this.#stream = null;
            this.#streamDate = null;
        }
    }

    constructor() {
        super(__dirname);
        // Синхронная проверка/создание файла при инициализации
        this.#checkFileSync();
    }

    /**
     * @description Формирует имя файла для текущей даты
     * @returns {string}
     */
    #getFileName(default_file_name = null) {
        if (default_file_name) return default_file_name;

        const today = new Date();
        if (this.getConfig().UTC) today.setTime(today.getTime() + today.getTimezoneOffset() * 6e4);

        const prefix = process.env.VITEST ? 'test-' : '';

        return prefix + this.getConfig().format.file_name
            .replace('%DD%', String(today.getDate()).padStart(2, '0'))
            .replace('%D%', today.getDate())
            .replace('%MM%', String(today.getMonth() + 1).padStart(2, '0'))
            .replace('%M%', (today.getMonth() + 1))
            .replace('%YYYY%', today.getFullYear())
            .replace('%YY%', String(today.getFullYear() % 100).padStart(2, '0'))
            + '.' + this.getConfig().format.file_extension;
    }

    /**
     * @description Синхронная проверка файла (только для конструктора)
     */
    #checkFileSync() {
        const directory = path.join(this.getDirname(), this.getConfig().directory);
        fs.mkdirSync(directory, { recursive: true });

        const file_name = this.#getFileName();
        const path_to_file = path.join(directory, file_name);

        if (!fs.existsSync(path_to_file)) {
            try { fs.writeFileSync(path_to_file, '[INFO]Файл логирования инициализирован\n', { flag: 'w+' }) }
            catch (_e) { /* ignore */ }
        }
    }

    /**
     * @description Получает WriteStream для текущего файла логов
     * @returns {fs.WriteStream}
     */
    #getStream() {
        const file_name = this.#getFileName();

        // Если дата сменилась — закрыть старый стрим и открыть новый
        if (this.#stream && this.#streamDate !== file_name) {
            this.#stream.end();
            this.#stream = null;
        }

        if (!this.#stream) {
            const directory = path.join(this.getDirname(), this.getConfig().directory);
            const path_to_file = path.join(directory, file_name);

            if (!fs.existsSync(path_to_file)) {
                try { fs.writeFileSync(path_to_file, '[INFO]Файл логирования инициализирован\n', { flag: 'w+' }) }
                catch (_e) { return null }
            }

            this.#stream = fs.createWriteStream(path_to_file, { flags: 'a' });
            this.#streamDate = file_name;
        }

        return this.#stream;
    }

    /**
     * @description Удаляет файлы логов старше save_logs дней
     */
    async #cleanOldLogs() {
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
                } catch (_e) { /* skip */ }
            }
        } catch (_e) { /* directory might not exist */ }
    }

    // ── Mongo-сток ──────────────────────────────────────────────

    /** @description Нужно ли писать лог в БД */
    #shouldWriteToDb(level, extra) {
        if (extra?.toDB) return true;
        const dbLevels = this.getConfig()?.db_levels || ['warn', 'error'];
        return dbLevels.includes(level);
    }

    /** @description Сбрасывает буфер логов в БД пакетом */
    #flush() {
        if (!this.#dbReady || !this.#logModel || this.#buffer.length === 0) return;

        const batch = this.#buffer.splice(0);
        this.#logModel.insertMany(batch, { ordered: false }).catch(e => {
            process.stderr.write(`[LOGGER] Ошибка записи логов в БД: ${e.message}\n`);
        });
    }

    /**
     * @description Подключает логгер к модели БД и запускает периодический сброс буфера.
     * Вызывается из entry-point после старта БД (только при db_enabled).
     * @param {import('mongoose').Model} logModel
     */
    connectToDb(logModel) {
        this.#logModel = logModel;
        this.#dbReady = true;

        const flushInterval = this.getConfig()?.db_flush_interval_ms || 2000;
        this.#flushTimer = setInterval(() => this.#flush(), flushInterval);
        this.#flushTimer.unref();

        this.#flush();
    }

    // ── Файловый сток ───────────────────────────────────────────

    /**
     * @description Пишет запись в файл (и в консоль, если не HTTP-лог)
     * @param {String} level
     * @param {Array<String>} message
     * @param {Boolean} silentConsole — не дублировать в консоль (для HTTP-трафика)
     */
    #writeToFile(level, message, silentConsole = false) {
        const stream = this.#getStream();
        if (!stream) return false;

        const now = new Date();
        if (this.getConfig().UTC) now.setTime(now.getTime() + now.getTimezoneOffset() * 6e4);

        const consoleFn = level === 'error' ? console.error
            : level === 'warn' ? console.warn
                : console.log;

        // JSON-формат для structured logging
        if (this.getConfig().json_format) {
            const entries = message.map(text => JSON.stringify({
                level: level.toUpperCase(),
                timestamp: now.toISOString(),
                message: text,
            }));
            const output = entries.join('\n') + '\n';
            stream.write(output);
            if (!silentConsole) consoleFn(output.trimEnd());
            return true;
        }

        // Стандартный текстовый формат
        message[message.length - 1] += '\n';
        const print = message.map(text =>
            this.getConfig().format.log
                .replace('%level%', level.toUpperCase())

                .replace('%HH%', String(now.getHours()).padStart(2, '0'))
                .replace('%H%', now.getHours())
                .replace('%MM%', String(now.getMinutes()).padStart(2, '0'))
                .replace('%M%', now.getMinutes())
                .replace('%SS%', String(now.getSeconds()).padStart(2, '0'))
                .replace('%S%', now.getSeconds())

                .replace('%text%', text)
        );
        const output = print.join('\n');
        stream.write(output);
        if (!silentConsole) consoleFn(output.trimEnd());

        return true;
    }

    /**
     * @param {'info'|'warn'|'error'} level Уровень сообщения
     * @param {String|Array<String>} message Сообщение или список сообщений
     * @param {*} [user_id] ID пользователя (попадает в Mongo-сток)
     * @param {Object} [extra] Доп. поля: { requestId, module, toDB, http_method, url, status_code, ... }
     * @description Пишет запись в файл/консоль и (опционально) в БД
     */
    log(level, message, user_id = null, extra = {}) {
        const messages = typeof message === 'string'
            ? [message]
            : (Array.isArray(message) ? message : [String(message)]);

        // --- Файловый + консольный сток (по умолчанию) ---
        if (this.#logging) this.#writeToFile(level, messages.slice(), !!extra.requestId);

        // --- Mongo-сток (опционально) ---
        if (this.#dbEnabled && this.#shouldWriteToDb(level, extra)) {
            const doc = {
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

    info(message, user_id = null, extra = {}) { return this.log('info', message, user_id, extra) }
    warn(message, user_id = null, extra = {}) { return this.log('warn', message, user_id, extra) }
    error(message, user_id = null, extra = {}) { return this.log('error', message, user_id, extra) }

    /**
     * @param {String} file_name Имя файла
     * @description Возвращает записи из выбранного файла логов
     * @returns {Promise<false|String>}
     */
    async get(file_name) {
        const extension = this.getConfig().format.file_extension;
        const splited = file_name.split('.');
        if (splited[splited.length - 1] !== extension) file_name += `.${extension}`;

        const directory = path.join(this.getDirname(), this.getConfig().directory);
        const path_to_file = path.join(directory, file_name);

        try {
            const content = await fsp.readFile(path_to_file, 'utf-8');
            return content;
        } catch (_e) {
            return false;
        }
    }
}

module.exports = Logger;
