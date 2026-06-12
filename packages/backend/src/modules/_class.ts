import type { ModuleStatus } from '@template-server/shared';

/**
 * Базовый класс модуля. Дженерик по типу конфига.
 * Конфиг передаётся типизированным объектом в конструктор (раньше грузился из config.json
 * с интерполяцией ${ENV} — теперь это типизированный config.ts, читающий process.env напрямую).
 */
export abstract class Module<TConfig = unknown> {
    readonly #dirname: string;
    /** Расположение папки модуля (для разрешения относительных путей) */
    getDirname(): string {
        return this.#dirname;
    }

    #config: TConfig;
    /** Конфиг модуля */
    getConfig(): TConfig {
        return this.#config;
    }

    #status: ModuleStatus = 'off';
    /** Состояние модуля */
    getStatus(): ModuleStatus {
        return this.#status;
    }

    /**
     * @param dirname Путь к папке модуля. Передавайте import.meta.dirname.
     * @param config Типизированный конфиг модуля.
     */
    constructor(dirname: string, config: TConfig) {
        this.#dirname = dirname;
        this.#config = config;
    }

    /** Функция непосредственного запуска (переопределяется наследниками) */
    protected startFunction(): void | Promise<void> {}

    /** Запуск модуля */
    async start(): Promise<boolean> {
        await this.startFunction();
        this.#status = 'on';
        return true;
    }

    /** Функция непосредственной остановки (переопределяется наследниками) */
    protected stopFunction(): void | Promise<void> {}

    /** Остановка модуля */
    async stop(): Promise<boolean> {
        this.#status = 'off';
        await this.stopFunction();
        return true;
    }
}

export default Module;
