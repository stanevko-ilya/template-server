const fs = require('fs');
const path = require('path');
const Module = require('../_class');
const modules = require('../../modules');

/**
 * @description Планировщик фоновых задач.
 *
 * Джобы авто-обнаруживаются в ./jobs/*.js. Каждый файл экспортирует объект:
 *   {
 *     name: string,
 *     enabled: boolean,
 *     daily?: { hour: number, minute: number },   // ежедневный запуск в указанное время
 *     interval_minutes?: number,                  // либо периодический запуск
 *     async run(modules, config) {}
 *   }
 *
 * Время daily-джоб считается по таймзоне config.timezone_offset_hours.
 * Параллельный запуск одной джобы защищён внутрипроцессным гардом и распределённым
 * Redis-локом (при наличии cache; без Redis — однопроцессный режим).
 */
class Notifier extends Module {
    /** @returns {typeof import('./config.json')} */
    getConfig() { return super.getConfig(); }

    #timers = [];
    #runningJobs = new Set();
    #jobs = [];

    constructor() { super(__dirname, './config.json'); }

    #loadJobs() {
        const jobsDir = path.join(this.getDirname(), 'jobs');
        if (!fs.existsSync(jobsDir)) return [];
        const files = fs.readdirSync(jobsDir).filter(f => f.endsWith('.js') && !f.startsWith('_'));
        const jobs = [];
        for (const file of files) {
            try {
                const job = require(path.join(jobsDir, file));
                if (job && typeof job.run === 'function' && job.name) jobs.push(job);
                else modules.logger?.warn(`[notifier] Джоба ${file} не экспортирует { name, run }`);
            } catch (e) {
                modules.logger?.error(`[notifier] Не удалось загрузить джобу ${file}: ${e.message}`);
            }
        }
        return jobs;
    }

    async startFunction() {
        const config = this.getConfig();
        this.#jobs = this.#loadJobs();

        for (const job of this.#jobs) {
            if (!job.enabled) continue;

            if (job.interval_minutes) {
                const intervalMs = job.interval_minutes * 60 * 1000;
                this.#scheduleInterval(job.name, intervalMs, () => this.#runJob(job.name, () => job.run(modules, config)));
            } else if (job.daily) {
                this.#scheduleJob(job.name, job.daily.hour, job.daily.minute, () => this.#runJob(job.name, () => job.run(modules, config)));
            } else {
                modules.logger?.warn(`[notifier] Джоба ${job.name} без расписания (daily/interval_minutes), пропущена`);
            }
        }

        modules.logger?.info(`[notifier] Запланировано джоб: ${this.#timers.length}`);
    }

    async stopFunction() {
        for (const timer of this.#timers) {
            clearTimeout(timer.handle);
            clearInterval(timer.handle);
        }
        this.#timers = [];
    }

    /** Ручной запуск джобы по имени (для крон-триггеров/админки) */
    async runJobNow(name) {
        const job = this.#jobs.find(j => j.name === name) || this.#loadJobs().find(j => j.name === name);
        if (!job) throw new Error(`Unknown job: ${name}`);
        await this.#runJob(name, () => job.run(modules, this.getConfig()));
    }

    /**
     * @description Вычисляет задержку (мс) до следующего запуска в таймзоне config.timezone_offset_hours
     */
    #getDelayMs(hour, minute) {
        const config = this.getConfig();
        const offsetMs = (config.timezone_offset_hours || 0) * 60 * 60 * 1000;

        const now = new Date();
        const nowTz = new Date(now.getTime() + offsetMs + now.getTimezoneOffset() * 60 * 1000);

        const targetTz = new Date(nowTz);
        targetTz.setHours(hour, minute, 0, 0);
        if (targetTz <= nowTz) targetTz.setDate(targetTz.getDate() + 1);

        const targetUtc = new Date(targetTz.getTime() - offsetMs - now.getTimezoneOffset() * 60 * 1000);
        return targetUtc.getTime() - now.getTime();
    }

    /** Планирует ежедневный запуск, с самоперепланированием */
    #scheduleJob(name, hour, minute, fn) {
        const delayMs = this.#getDelayMs(hour, minute);
        const hours = Math.floor(delayMs / 3600000);
        const minutes = Math.floor((delayMs % 3600000) / 60000);

        modules.logger?.info(`[notifier] Джоба ${name} запланирована через ${hours}ч ${minutes}м (${hour}:${String(minute).padStart(2, '0')})`);

        const handle = setTimeout(() => {
            fn();
            this.#scheduleJob(name, hour, minute, fn); // перепланировать на завтра
        }, delayMs);
        handle.unref();
        this.#timers.push({ name, handle });
    }

    /** Планирует периодический запуск: сразу при старте, затем каждые intervalMs */
    #scheduleInterval(name, intervalMs, fn) {
        const minutes = Math.floor(intervalMs / 60000);
        modules.logger?.info(`[notifier] Джоба ${name} запланирована каждые ${minutes}м`);

        fn(); // запуск при старте
        const handle = setInterval(fn, intervalMs);
        handle.unref();
        this.#timers.push({ name, handle });
    }

    /**
     * @description Обёртка запуска джобы: логирование, блокировка, обработка ошибок
     */
    async #runJob(name, fn, lockTtl = 7200) {
        if (this.#runningJobs.has(name)) {
            modules.logger?.warn(`[notifier] Джоба ${name} уже выполняется, пропускаем`);
            return;
        }

        // Распределённый лок через Redis (если кэш доступен). Без Redis — однопроцессный режим.
        const useLock = !!modules.cache?.client;
        const lockKey = `notifier:lock:${name}`;
        if (useLock) {
            const acquired = await modules.cache.setnx(lockKey, String(process.pid), lockTtl);
            if (!acquired) {
                modules.logger?.warn(`[notifier] Джоба ${name} заблокирована другим процессом, пропускаем`);
                return;
            }
        }

        this.#runningJobs.add(name);
        const startTime = Date.now();
        modules.logger?.info(`[notifier] ▶ Джоба ${name} запущена`);

        try {
            await fn();
            const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
            modules.logger?.info(`[notifier] ✓ Джоба ${name} завершена за ${durationSec}с`);
        } catch (e) {
            modules.logger?.error(`[notifier] ✗ Джоба ${name} ошибка: ${e.message}`);
            modules.logger?.error(e.stack || '');
        } finally {
            this.#runningJobs.delete(name);
            if (useLock) await modules.cache.del(lockKey);
        }
    }
}

module.exports = Notifier;
