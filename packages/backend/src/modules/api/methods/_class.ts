import express, { type Express, type Request, type Response, type RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import mongoose from 'mongoose';

import { Module } from '../../_class.js';
import API from '../index.js';
import apiConfig from '../config.js';
import getUserRateLimit from '../middleware/userRateLimit.js';
import { getJwtSecret, warnNoJwtSecretOnce } from '../../../functions/jwtSecret.js';
import modules from '../../../modules.js';
import { ERROR_CODES, ERROR_MESSAGES, type HttpMethod, type ParamSpec } from '@template-server/shared';

export interface MethodAuth {
    roles?: string[];
}

export interface MethodErrorDef {
    code: number;
    message: string;
}

export interface MethodResponseDoc {
    ref?: string;
    schema?: unknown;
    description?: string;
}

export interface MethodConfig {
    use: boolean;
    /** HTTP-метод (для API-эндпоинтов). У socket-событий отсутствует. */
    method?: HttpMethod;
    auth?: MethodAuth | boolean;
    params?: ParamSpec[];
    errors?: MethodErrorDef[];
    bodyLimit?: string;
    // Поля для Swagger-документации
    summary?: string;
    tag?: string;
    service_key?: boolean;
    response?: MethodResponseDoc;
    url?: string;
    // Дополняются normalizeMethodConfig()
    required_params?: string[];
    have_params?: boolean;
}

export interface MethodTest {
    request: { params?: Record<string, unknown>; headers?: Record<string, string> };

    expect: { status: number; body: unknown | ((response: any) => boolean) };
}

type SendResponse = (...args: any[]) => void;

/** Результат метода может быть данными, ошибкой по коду или булевым флагом */
export interface MethodErrorResult {
    error_code: number;
    status?: number;
}

/**
 * Дополняет конфиг метода: проверка уникальности имён параметров +
 * вычисление required_params/have_params (раньше делалось в Method.loadConfig).
 */
export function normalizeMethodConfig<T extends MethodConfig>(config: T): T {
    if (Array.isArray(config.params) && config.params.length > 0) {
        if (new Set(config.params.map((param) => param.name)).size !== config.params.length) {
            throw new Error('Имя параметров должны быть уникальные');
        }
        config.required_params = config.params.filter((param) => param.required).map((param) => param.name);
        config.have_params = true;
    }
    return config;
}

export abstract class Method<TConfig extends MethodConfig = MethodConfig, TResponse = unknown> extends Module<TConfig> {
    #url: string;
    getUrl(): string {
        return this.#url;
    }

    #express: Express;
    getExpress(): Express {
        return this.#express;
    }

    sendResponse: SendResponse = API.send;

    #errors: MethodErrorDef[] = [
        ERROR_CODES.EXECUTION,
        ERROR_CODES.PARAMS,
        ERROR_CODES.DISABLED,
        ERROR_CODES.AUTH_REQUIRED,
        ERROR_CODES.FORBIDDEN,
    ].map((code) => ({ code, message: ERROR_MESSAGES[code] }));

    getError(code: number): MethodErrorDef | undefined {
        return this.#errors.find((error) => error.code === code);
    }

    regError(code: number, message: string): void {
        if (this.getError(code)) throw new Error('Код ошибки уже занят в данном методе');
        this.#errors.push({ code, message });
    }

    /** Обработчик метода (переопределяется наследниками) */
    getResponse(_req: Request, _res: Response): TResponse | boolean | Promise<TResponse | boolean> {
        return true;
    }

    /** Конфигурация теста для метода, или null если тест не определён */
    getTest(): MethodTest | null {
        return null;
    }

    /** Валидация и приведение типов параметров. Возвращает true или имя невалидного параметра. */
    checkParams(data: Record<string, unknown>): true | string {
        const config = this.getConfig();

        // Проверка наличия обязательных параметров
        for (const key of config.required_params ?? []) {
            if (!(key in data)) return key;
        }

        // Обработка переданных параметров
        for (const key in data) {
            const paramConfig: ParamSpec | undefined = config.params?.find((param) => param.name === key);
            if (!paramConfig) {
                delete data[key];
                continue;
            }

            let value: unknown = data[key];
            try {
                switch (paramConfig.type) {
                    case 'number': {
                        value = Number(value);
                        const num = value as number;
                        if (
                            paramConfig.orientation &&
                            ((paramConfig.orientation === 'positive' && num < 0) ||
                                (paramConfig.orientation === 'negative' && num > 0))
                        ) {
                            value = num * -1;
                        }
                        if (
                            paramConfig.interval &&
                            (paramConfig.interval[0] >= (value as number) ||
                                paramConfig.interval[1] <= (value as number))
                        ) {
                            return key;
                        }
                        break;
                    }

                    case 'boolean':
                        value = Boolean(Number.parseInt(value as string));
                        break;

                    case 'object':
                        value = JSON.parse(value as string);
                        break;

                    case 'objectId':
                        value = new mongoose.Types.ObjectId(value as string);
                        break;

                    case 'array':
                        if (typeof value === 'string') value = JSON.parse(value);
                        if (!Array.isArray(value)) return key;
                        break;
                }
            } catch {
                return key;
            }

            if (paramConfig.valid_values && !paramConfig.valid_values.includes(value)) return key;

            data[key] = value;
        }

        return true;
    }

    constructor(dirname: string, config: TConfig, url: string, app: Express) {
        super(dirname, normalizeMethodConfig(config));

        this.#url = url;
        this.#express = app;
        this.sendResponse = API.send;

        const methodConfig = this.getConfig();
        if (methodConfig) {
            if (methodConfig.auth) warnNoJwtSecretOnce(modules.logger);
            if (Array.isArray(methodConfig.errors)) {
                for (const error of methodConfig.errors) {
                    if ('code' in error && 'message' in error) this.regError(error.code, error.message);
                }
            }
        }

        this.createNode();
    }

    createNode(): boolean | void {
        const config = this.getConfig();
        if (!config) return false;

        const middlewares: RequestHandler[] = [];
        const method = config.method ?? 'get';

        // Per-route body-парсер: лимит из config.bodyLimit метода, иначе глобальный apiConfig.bodyLimit,
        // иначе 512kb. В TEST_MODE всегда 50mb (нагрузочные тесты). + NoSQL-санитайз тела.
        if (method !== 'get') {
            const bodyLimit =
                process.env.TEST_MODE === 'true' ? '50mb' : config.bodyLimit || apiConfig.bodyLimit || '512kb';
            middlewares.push(express.json({ limit: bodyLimit }));
            middlewares.push(express.urlencoded({ extended: false, limit: bodyLimit }));
            middlewares.push((req, _res, next) => {
                if (req.body) req.body = API.sanitize(req.body);
                next();
            });
        }

        // Per-user rate limit для авторизованных эндпоинтов
        if (config.auth) {
            middlewares.push(getUserRateLimit(apiConfig.userRateLimit));
        }

        const app = this.getExpress();
        const register = (app[method] as (path: string, ...handlers: RequestHandler[]) => void).bind(app);

        register(this.getUrl(), ...middlewares, async (req: Request, res: Response) => {
            req.container_data = (req.method === 'GET' ? req.query : req.body) as Record<string, unknown>;
            if (!req.container_data) req.container_data = {};

            let response: unknown;
            let done: boolean | string = config.use;
            if (!done) return this.sendResponse(res, this.getError(-3), 503);

            if (config.auth) {
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return this.sendResponse(res, this.getError(-4), 401);
                }

                const token = authHeader.slice(7);
                try {
                    req.user = jwt.verify(token, getJwtSecret());

                    // Проверка ролей
                    const auth = config.auth;
                    if (typeof auth === 'object' && auth.roles && auth.roles.length > 0) {
                        const userRole = (req.user as JwtPayload)?.role || '';
                        if (!auth.roles.includes(userRole)) {
                            return this.sendResponse(res, this.getError(-5), 403);
                        }
                    }
                } catch {
                    return this.sendResponse(res, this.getError(-4), 401);
                }
            }

            if (config.have_params) done = this.checkParams(req.container_data);
            if (done !== true) return this.sendResponse(res, { ...this.getError(-2), param_name: done }, 400);

            try {
                response = await this.getResponse(req, res);
            } catch (e) {
                done = false;
                modules.logger?.error(`Ошибка в методе ${this.getUrl()}: ${(e as Error).message}`, null, {
                    requestId: req.requestId,
                });
                modules.logger?.error((e as Error).stack || '', null, { requestId: req.requestId });
            }

            if (!done) return this.sendResponse(res, this.getError(-1), 500);
            if (res.headersSent) return;

            if (response instanceof Object && 'error_code' in response) {
                const r = response as MethodErrorResult;
                return this.sendResponse(res, this.getError(r.error_code), 'status' in r ? r.status : 200);
            }
            this.sendResponse(res, response);
        });
    }
}

export default Method;
