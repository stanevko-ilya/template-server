import type { ParamType, ParamOrientation } from '../enums.js';

/** Успешный ответ API: тело оборачивается в { response } */
export interface ApiSuccess<T> {
    response: T;
}

/** Тело ошибки API */
export interface ApiErrorBody {
    code: number;
    message: string;
    /** Имя невалидного параметра (для кода -2) */
    param_name?: string;
}

/** Ответ-ошибка API: тело оборачивается в { error } */
export interface ApiError {
    error: ApiErrorBody;
}

/** Универсальный ответ API */
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Описание параметра метода (config-driven валидация в Method.checkParams) */
export interface ParamSpec {
    name: string;
    type: ParamType;
    required?: boolean;
    interval?: [number, number];
    orientation?: ParamOrientation;
    valid_values?: unknown[];
}
