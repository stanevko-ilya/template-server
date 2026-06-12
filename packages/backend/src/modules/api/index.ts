import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';
import { rateLimit, type Options } from 'express-rate-limit';

import { Module } from '../_class.js';
import directorySearch from '../../functions/directorySearch.js';
import { runtimeExt, importDefault } from '../../functions/importModule.js';
import modules from '../../modules.js';
import setupSwagger from './swagger.js';
import apiConfig, { type ApiConfig } from './config.js';

/** Рекурсивно удаляет ключи, начинающиеся с '$', для защиты от NoSQL-инъекций */
function sanitize(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map(sanitize);
    if (obj && typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(obj)) {
            if (!key.startsWith('$')) result[key] = sanitize((obj as Record<string, unknown>)[key]);
        }
        return result;
    }
    return obj;
}

/** Минимальная общая форма конфига сервера (API и Sockets). Специфичные поля
 *  читаются через #apiConfig()/getConfig() с приведением к конкретному типу. */
export interface ApiBaseConfig {
    port?: string | number;
    cors?: CorsOptions;
    use?: boolean;
}

/**
 * HTTP API сервер на Express. Базовый класс также наследуется Sockets (поэтому дженерик
 * по типу конфига — Sockets подставляет собственный конфиг).
 * TLS терминируется внешним nginx — приложение слушает plain HTTP.
 */
export class API<TConfig extends ApiBaseConfig = ApiConfig> extends Module<TConfig> {
    /** Возвращает ответ пользователю на API-запрос */
    static send(res: Response, data: unknown, code = 200): void {
        res.status(code).send(code < 400 ? { response: data } : { error: data });
    }

    static sanitize = sanitize;

    #express!: Express;
    #activeRequests = 0;
    #draining = false;
    #server!: http.Server;

    // Передача dirname/config, так как класс API наследуется классом Sockets
    constructor(dirname: string = import.meta.dirname, config: TConfig = apiConfig as unknown as TConfig) {
        super(dirname, config);
    }

    /** Доступ к конфигу как к ApiConfig (методы ниже вызываются только для API-инстанса) */
    #apiConfig(): ApiConfig {
        return this.getConfig() as unknown as ApiConfig;
    }

    async #initExpress(): Promise<void> {
        const cfg = this.#apiConfig();
        this.#express = express();

        // Security middleware
        this.#express.use(helmet());
        this.#express.use(cors(cfg.cors || {}));

        // Глобальный rate limit (в TEST_MODE отключаем — для нагрузочных/интеграционных тестов)
        if (process.env.TEST_MODE !== 'true') {
            const rl = cfg.rateLimit || ({} as ApiConfig['rateLimit']);
            const options: Partial<Options> = {
                windowMs: rl.windowMs || 15 * 60 * 1000,
                max: rl.max || 100,
                standardHeaders: true,
                legacyHeaders: false,
            };
            const redisClient = modules.cache?.client;
            if (redisClient) {
                try {
                    const { RedisStore } = await import('rate-limit-redis');
                    options.store = new RedisStore({
                        sendCommand: (...args: string[]): any => redisClient.call(...(args as [string, ...string[]])),
                        prefix: 'rl:global:',
                    });
                } catch {
                    /* in-memory fallback */
                }
            }
            this.#express.use(rateLimit(options));
        }

        // Статика
        this.#express.use('/', express.static(path.join(this.getDirname(), cfg.paths.static)));

        // Кастомные заголовки
        const headers = cfg.headers;
        if (headers instanceof Array && headers.length > 0) {
            this.#express.use((req: Request, res: Response, next: NextFunction) => {
                for (const header of headers) {
                    if ('name' in header && 'value' in header) res.setHeader(header.name, header.value);
                }
                next();
            });
        }

        this.#express.use((req: Request, res: Response, next: NextFunction) => {
            if (req.method === 'OPTIONS') return API.send(res, 'OK');
            next();
        });

        // Request ID для трассировки
        this.#express.use((req: Request, _res: Response, next: NextFunction) => {
            req.requestId = randomUUID();
            next();
        });

        // Drain guard: отклоняем новые запросы при graceful shutdown, считаем активные
        this.#express.use((req: Request, res: Response, next: NextFunction) => {
            if (this.#draining) return API.send(res, { code: -3, message: 'Сервер завершает работу' }, 503);
            this.#activeRequests++;
            res.on('finish', () => {
                this.#activeRequests--;
            });
            next();
        });

        // Body-парсеры и NoSQL-санитайз подключаются per-route в methods/_class.ts,
        // чтобы можно было задавать индивидуальный bodyLimit через config.bodyLimit метода.

        // Защита от XSS-векторов в query-параметрах (req.query read-only в Express 5).
        const INJECTION_RE = /<script|javascript:|on\w+\s*=/i;
        this.#express.use((req: Request, res: Response, next: NextFunction) => {
            for (const val of Object.values(req.query || {})) {
                if (typeof val === 'string' && INJECTION_RE.test(val)) {
                    return API.send(res, { code: -2, message: 'Недопустимые символы в параметрах' }, 400);
                }
            }
            next();
        });

        // Логирование запросов с requestId, body/query/headers/response, длительностью
        const SAFE_HEADERS = [
            'user-agent',
            'content-type',
            'accept-language',
            'x-forwarded-for',
            'x-real-ip',
            'referer',
            'origin',
        ];
        const MAX_BODY_SIZE = 4096;
        function truncateForLog(value: unknown): unknown {
            if (value == null) return null;
            const str = typeof value === 'string' ? value : JSON.stringify(value);
            if (str.length <= MAX_BODY_SIZE) return value;
            return { _truncated: true, preview: str.slice(0, MAX_BODY_SIZE) };
        }
        this.#express.use((req: Request, res: Response, next: NextFunction) => {
            const start = Date.now();

            // Перехватываем res.send для сохранения тела ответа
            const originalSend = res.send.bind(res);
            let capturedResponse: unknown = null;

            res.send = (body?: any) => {
                capturedResponse = body;
                return originalSend(body);
            };

            res.on('finish', () => {
                // Не логируем запросы на незарегистрированные эндпоинты
                if (!req.route) return;

                const duration = Date.now() - start;
                const user = req.user as { id?: unknown; sub?: unknown } | undefined;
                const userId = (user?.id ?? user?.sub ?? req.user_id ?? null) as string | number | null;
                const msg = `[${req.requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;

                const safeHeaders: Record<string, string> = {};
                for (const h of SAFE_HEADERS) if (req.headers[h]) safeHeaders[h] = String(req.headers[h]);

                let responseBody: unknown = null;
                if (capturedResponse != null) {
                    try {
                        responseBody = truncateForLog(
                            typeof capturedResponse === 'string' ? JSON.parse(capturedResponse) : capturedResponse,
                        );
                    } catch {
                        responseBody = truncateForLog(capturedResponse);
                    }
                }

                const extra = {
                    requestId: req.requestId,
                    toDB: res.statusCode >= 400,
                    http_method: req.method,
                    url: req.originalUrl,
                    status_code: res.statusCode,
                    duration_ms: duration,
                    request_body:
                        req.method !== 'GET' && req.body && Object.keys(req.body).length
                            ? truncateForLog(req.body)
                            : null,
                    request_query: req.query && Object.keys(req.query).length ? req.query : null,
                    request_headers: Object.keys(safeHeaders).length ? safeHeaders : null,
                    response_body: responseBody,
                };

                const level = res.statusCode >= 400 ? 'warn' : 'info';
                modules.logger?.log(level, msg, userId, extra);
            });
            next();
        });
    }

    async #initMethod(): Promise<void> {
        const cfg = this.#apiConfig();
        const ext = runtimeExt(import.meta.filename);
        const methodsRoot = path.join(this.getDirname(), cfg.paths.methods);
        const methodsToken = cfg.paths.methods.split('/').reverse()[0];

        const files = directorySearch(methodsRoot, `index${ext}`, true);
        for (const file of files) {
            const splited = file.replace(/\\/g, '/').split('/');
            const url =
                '/' +
                cfg.sub_url +
                '/' +
                splited.slice(splited.findIndex((e) => e === methodsToken) + 1, splited.length - 1).join('/');

            const MethodClass = await importDefault<new (url: string, app: Express) => unknown>(file);
            new MethodClass(url, this.#express);
        }
    }

    protected async startFunction(): Promise<void> {
        await this.#initExpress();
        await this.#initMethod();
        await setupSwagger(this.#express);

        // TLS терминируется внешним nginx — приложение слушает plain HTTP
        this.#server = http.createServer(this.#express);

        await new Promise<void>((resolve) => {
            const port = Number(this.#apiConfig().port) || 3000;
            this.#server.listen(port, () => {
                modules.logger?.log('info', `HTTP сервер запущен, порт: ${port}`);
                resolve();
            });
        });
    }

    protected async stopFunction(): Promise<void> {
        this.#draining = true;
        this.#server.closeIdleConnections?.();

        // Ждём завершения активных запросов (до 5 секунд)
        const deadline = Date.now() + 5000;
        while (this.#activeRequests > 0 && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 100));
        }

        await new Promise<void>((resolve) => {
            this.#server.close(() => {
                modules.logger?.log('info', 'Сервер остановлен');
                resolve();
            });
            setTimeout(() => this.#server.closeAllConnections?.(), 2000);
        });
    }
}

export default API;
