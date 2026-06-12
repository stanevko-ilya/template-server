declare global {
    namespace NodeJS {
        interface Process {
            /** Распарсенные аргументы запуска (--key value) */
            argvParsed?: Record<string, string | true>;
            /** Опциональный глобальный конфиг (config.json в cwd) */
            globalConfig?: Record<string, unknown>;
        }
    }
}

export {};
