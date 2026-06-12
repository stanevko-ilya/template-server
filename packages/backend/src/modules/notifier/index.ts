import fs from 'node:fs';
import path from 'node:path';

import { Module } from '../_class.js';
import modules, { type Modules } from '../../modules.js';
import { runtimeExt, importDefault } from '../../functions/importModule.js';
import config, { type NotifierConfig } from './config.js';

/** Описание фоновой джобы (файл в ./jobs/*) */
export interface NotifierJob {
    name: string;
    enabled: boolean;
    daily?: { hour: number; minute: number };
    interval_minutes?: number;
    run(modules: Modules, config: NotifierConfig): Promise<void> | void;
}

interface TimerEntry {
    name: string;
    handle: NodeJS.Timeout;
}

/**
 * Планировщик фоновых задач.
 *
 * Джобы авто-обнаруживаются в ./jobs/*. Каждый файл экспортирует объект:
 *   { name, enabled, daily?: { hour, minute }, interval_minutes?, async run(modules, config) {} }
 *
 * Время daily-джоб считается по таймзоне config.timezone_offset_hours. Параллельный запуск
 * одной джобы защищён внутрипроцессным гардом и распределённым Redis-локом (при наличии cache).
 */
export class Notifier extends Module<NotifierConfig> {
    #timers: TimerEntry[] = [];
    #runningJobs = new Set<string>();
    #jobs: NotifierJob[] = [];

    constructor() {
        super(import.meta.dirname, config);
    }

    async #loadJobs(): Promise<NotifierJob[]> {
        const jobsDir = path.join(this.getDirname(), 'jobs');
        if (!fs.existsSync(jobsDir)) return [];
        const ext = runtimeExt(import.meta.filename);
        const files = fs.readdirSync(jobsDir).filter((f) => f.endsWith(ext) && !f.startsWith('_'));
        const jobs: NotifierJob[] = [];
        for (const file of files) {
            try {
                const job = await importDefault<NotifierJob>(path.join(jobsDir, file));
                if (job && typeof job.run === 'function' && job.name) jobs.push(job);
                else modules.logger?.warn(`[notifier] Джоба ${file} не экспортирует { name, run }`);
            } catch (e) {
                modules.logger?.error(`[notifier] Не удалось загрузить джобу ${file}: ${(e as Error).message}`);
            }
        }
        return jobs;
    }

    protected async startFunction(): Promise<void> {
        const cfg = this.getConfig();
        this.#jobs = await this.#loadJobs();

        for (const job of this.#jobs) {
            if (!job.enabled) continue;

            if (job.interval_minutes) {
                const intervalMs = job.interval_minutes * 60 * 1000;
                this.#scheduleInterval(job.name, intervalMs, () => this.#runJob(job.name, () => job.run(modules, cfg)));
            } else if (job.daily) {
                this.#scheduleJob(job.name, job.daily.hour, job.daily.minute, () =>
                    this.#runJob(job.name, () => job.run(modules, cfg)),
                );
            } else {
                modules.logger?.warn(`[notifier] Джоба ${job.name} без расписания (daily/interval_minutes), пропущена`);
            }
        }

        modules.logger?.info(`[notifier] Запланировано джоб: ${this.#timers.length}`);
    }

    protected async stopFunction(): Promise<void> {
        for (const timer of this.#timers) {
            clearTimeout(timer.handle);
            clearInterval(timer.handle);
        }
        this.#timers = [];
    }

    /** Ручной запуск джобы по имени (для крон-триггеров/админки) */
    async runJobNow(name: string): Promise<void> {
        const job = this.#jobs.find((j) => j.name === name) || (await this.#loadJobs()).find((j) => j.name === name);
        if (!job) throw new Error(`Unknown job: ${name}`);
        await this.#runJob(name, () => job.run(modules, this.getConfig()));
    }

    /** Вычисляет задержку (мс) до следующего запуска в таймзоне config.timezone_offset_hours */
    #getDelayMs(hour: number, minute: number): number {
        const cfg = this.getConfig();
        const offsetMs = (cfg.timezone_offset_hours || 0) * 60 * 60 * 1000;

        const now = new Date();
        const nowTz = new Date(now.getTime() + offsetMs + now.getTimezoneOffset() * 60 * 1000);

        const targetTz = new Date(nowTz);
        targetTz.setHours(hour, minute, 0, 0);
        if (targetTz <= nowTz) targetTz.setDate(targetTz.getDate() + 1);

        const targetUtc = new Date(targetTz.getTime() - offsetMs - now.getTimezoneOffset() * 60 * 1000);
        return targetUtc.getTime() - now.getTime();
    }

    /** Планирует ежедневный запуск, с самоперепланированием */
    #scheduleJob(name: string, hour: number, minute: number, fn: () => void): void {
        const delayMs = this.#getDelayMs(hour, minute);
        const hours = Math.floor(delayMs / 3600000);
        const minutes = Math.floor((delayMs % 3600000) / 60000);

        modules.logger?.info(
            `[notifier] Джоба ${name} запланирована через ${hours}ч ${minutes}м (${hour}:${String(minute).padStart(2, '0')})`,
        );

        const handle = setTimeout(() => {
            fn();
            this.#scheduleJob(name, hour, minute, fn); // перепланировать на завтра
        }, delayMs);
        handle.unref();
        this.#timers.push({ name, handle });
    }

    /** Планирует периодический запуск: сразу при старте, затем каждые intervalMs */
    #scheduleInterval(name: string, intervalMs: number, fn: () => void): void {
        const minutes = Math.floor(intervalMs / 60000);
        modules.logger?.info(`[notifier] Джоба ${name} запланирована каждые ${minutes}м`);

        fn(); // запуск при старте
        const handle = setInterval(fn, intervalMs);
        handle.unref();
        this.#timers.push({ name, handle });
    }

    /** Обёртка запуска джобы: логирование, блокировка, обработка ошибок */
    async #runJob(name: string, fn: () => Promise<void> | void, lockTtl = 7200): Promise<void> {
        if (this.#runningJobs.has(name)) {
            modules.logger?.warn(`[notifier] Джоба ${name} уже выполняется, пропускаем`);
            return;
        }

        // Распределённый лок через Redis (если кэш доступен). Без Redis — однопроцессный режим.
        const useLock = !!modules.cache?.client;
        const lockKey = `notifier:lock:${name}`;
        if (useLock) {
            const acquired = await modules.cache!.setnx(lockKey, String(process.pid), lockTtl);
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
            modules.logger?.error(`[notifier] ✗ Джоба ${name} ошибка: ${(e as Error).message}`);
            modules.logger?.error((e as Error).stack || '');
        } finally {
            this.#runningJobs.delete(name);
            if (useLock) await modules.cache!.del(lockKey);
        }
    }
}

export default Notifier;
