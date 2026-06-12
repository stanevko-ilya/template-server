/** Стандартные коды ошибок API (совпадают с modules/api/methods/_class.ts) */
export const ERROR_CODES = {
    /** Ошибка во время выполнения запроса */
    EXECUTION: -1,
    /** Ошибка во время проверки параметров запроса */
    PARAMS: -2,
    /** Метод отключён */
    DISABLED: -3,
    /** Необходима авторизация */
    AUTH_REQUIRED: -4,
    /** Недостаточно прав */
    FORBIDDEN: -5,
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Сообщения стандартных ошибок (используются для реестра ошибок в Method) */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
    [ERROR_CODES.EXECUTION]: 'Ошибка во время выполнения запроса',
    [ERROR_CODES.PARAMS]: 'Ошибка во время проверки параметров запроса',
    [ERROR_CODES.DISABLED]: 'Метод отключен',
    [ERROR_CODES.AUTH_REQUIRED]: 'Необходима авторизация',
    [ERROR_CODES.FORBIDDEN]: 'Недостаточно прав',
};
