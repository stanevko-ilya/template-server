/** Состояние жизненного цикла модуля */
export type ModuleStatus = 'off' | 'load' | 'on';

/** Уровень логирования */
export type LogLevel = 'info' | 'warn' | 'error';

/** Тип параметра метода API (для config-driven валидации) */
export type ParamType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'objectId';

/** Принудительная ориентация числового параметра */
export type ParamOrientation = 'positive' | 'negative';

/** HTTP-метод эндпоинта */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
