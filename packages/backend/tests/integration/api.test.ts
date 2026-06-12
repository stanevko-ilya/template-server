import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Устанавливаем env до загрузки модулей
process.env.API_PORT = '18082';
process.env.SOCKETS_PORT = '18083';

import modules, { loadModules } from '../../src/modules.js';
import directorySearch from '../../src/functions/directorySearch.js';
import { runtimeExt, importDefault } from '../../src/functions/importModule.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const API_PORT = 18082;
const API_SUB_URL = 'api';
const METHODS_DIR = path.join(testDir, '../../src/modules/api/methods');

/** Создаёт тестовый JWT-токен */
function createTestToken(payload: object = { role: 'admin' }): string {
    const secret = process.env.JWT_SECRET || 'default-secret';
    return jwt.sign(payload, secret);
}

interface HttpResult {
    statusCode?: number;
    body: any;
}

/** Выполняет HTTP-запрос и возвращает { statusCode, body } */
function httpRequest(
    method: string,
    urlPath: string,
    { params, headers }: { params?: Record<string, any>; headers?: Record<string, string> } = {},
): Promise<HttpResult> {
    return new Promise((resolve, reject) => {
        let requestPath = urlPath;

        // Для GET добавляем query-параметры в URL
        if (method === 'get' && params && Object.keys(params).length > 0) {
            const query = new URLSearchParams(params).toString();
            requestPath = `${urlPath}?${query}`;
        }

        const options: http.RequestOptions = {
            hostname: '127.0.0.1',
            port: API_PORT,
            path: requestPath,
            method: method.toUpperCase(),
            headers: { ...headers },
        };

        // Для не-GET методов отправляем body
        let bodyData: string | undefined;
        if (method !== 'get' && params && Object.keys(params).length > 0) {
            bodyData = JSON.stringify(params);
            (options.headers as Record<string, any>)['Content-Type'] = 'application/json';
            (options.headers as Record<string, any>)['Content-Length'] = Buffer.byteLength(bodyData);
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ statusCode: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('timeout'));
        });

        if (bodyData) req.write(bodyData);
        req.end();
    });
}

/** Собирает тесты из всех методов API через getTest() */
async function collectMethodTests(): Promise<Array<{ url: string; httpMethod: string; testConfig: any }>> {
    const tests: Array<{ url: string; httpMethod: string; testConfig: any }> = [];

    // Stub-express для безопасного инстанцирования методов
    const stubExpress = new Proxy({}, { get: () => () => {} }) as unknown as Express;

    const ext = runtimeExt(import.meta.filename);
    const files = directorySearch(METHODS_DIR, `index${ext}`, true);

    for (const filePath of files) {
        const MethodClass = await importDefault<new (url: string, app: Express) => any>(filePath);

        // Вычисляем URL так же, как API.#initMethod
        const splited = filePath.replace(/\\/g, '/').split('/');
        const url =
            '/' +
            API_SUB_URL +
            '/' +
            splited.slice(splited.findIndex((e) => e === 'methods') + 1, splited.length - 1).join('/');

        const instance = new MethodClass(url, stubExpress);
        const testConfig = instance.getTest();
        const methodConfig = instance.getConfig();

        if (testConfig) {
            // Автоматическая инъекция JWT для методов с auth
            if (methodConfig.auth && !testConfig.request?.headers?.Authorization) {
                testConfig.request = testConfig.request || {};
                testConfig.request.headers = testConfig.request.headers || {};
                testConfig.request.headers.Authorization = `Bearer ${createTestToken()}`;
            }

            tests.push({ url, httpMethod: methodConfig.method, testConfig });
        }
    }

    return tests;
}

const methodTests = await collectMethodTests();

describe('Тестирование API методов', () => {
    beforeAll(async () => {
        await loadModules();
        await modules.logger!.start();
        await modules.api!.start();
    });

    afterAll(async () => {
        await modules.api!.stop();
        await modules.logger!.stop();
    });

    for (const { url, httpMethod, testConfig } of methodTests) {
        it(`${httpMethod.toUpperCase()} ${url} отвечает корректно`, async () => {
            const { statusCode, body } = await httpRequest(httpMethod, url, testConfig.request);

            expect(statusCode).toBe(testConfig.expect.status);

            if (typeof testConfig.expect.body === 'function') {
                const responseData = (statusCode ?? 0) < 400 ? body.response : body.error;
                expect(testConfig.expect.body(responseData)).toBe(true);
            } else {
                expect(body.response).toEqual(testConfig.expect.body);
            }
        });
    }
});
