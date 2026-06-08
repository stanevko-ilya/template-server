const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');

// Устанавливаем env до загрузки модулей
process.env.API_PORT = '18082';
process.env.SOCKETS_PORT = '18083';

const modules = require('../../modules');
const directorySearch = require('../../functions/directorySearch');

const API_PORT = 18082;
const API_SUB_URL = 'api';
const METHODS_DIR = path.join(__dirname, '../../modules/api/methods');

/**
 * Создаёт тестовый JWT-токен
 */
function createTestToken(payload = { role: 'admin' }) {
    const secret = process.env.JWT_SECRET || 'default-secret';
    return jwt.sign(payload, secret);
}

/**
 * Выполняет HTTP-запрос и возвращает { statusCode, body }
 */
function httpRequest(method, urlPath, { params, headers } = {}) {
    return new Promise((resolve, reject) => {
        let requestPath = urlPath;

        // Для GET добавляем query-параметры в URL
        if (method === 'get' && params && Object.keys(params).length > 0) {
            const query = new URLSearchParams(params).toString();
            requestPath = `${urlPath}?${query}`;
        }

        const options = {
            hostname: '127.0.0.1',
            port: API_PORT,
            path: requestPath,
            method: method.toUpperCase(),
            headers: { ...headers }
        };

        // Для не-GET методов отправляем body
        let bodyData;
        if (method !== 'get' && params && Object.keys(params).length > 0) {
            bodyData = JSON.stringify(params);
            options.headers['Content-Type'] = 'application/json';
            options.headers['Content-Length'] = Buffer.byteLength(bodyData);
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk });
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
                } catch (_e) {
                    resolve({ statusCode: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')) });

        if (bodyData) req.write(bodyData);
        req.end();
    });
}

/**
 * Собирает тесты из всех методов API через getTest()
 */
function collectMethodTests() {
    const tests = [];

    // Stub-express для безопасного инстанцирования методов
    const stubExpress = new Proxy({}, {
        get: () => () => {}
    });

    directorySearch(METHODS_DIR, (filePath) => {
        const MethodClass = require(filePath);

        // Вычисляем URL так же, как API.#initMethod
        const splited = filePath.replace(/\\/g, '/').split('/');
        const methodsToken = 'methods';
        const url = '/' + API_SUB_URL + '/' + splited
            .slice(splited.findIndex(e => e === methodsToken) + 1, splited.length - 1)
            .join('/');

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

            tests.push({
                url,
                httpMethod: methodConfig.method,
                testConfig,
            });
        }
    }, 'index.js', true);

    return tests;
}

describe('Тестирование API методов', () => {
    beforeAll(async () => {
        await modules.logger.start();
        await modules.api.start();
    });

    afterAll(async () => {
        await modules.api.stop();
        await modules.logger.stop();
    });

    const methodTests = collectMethodTests();

    for (const { url, httpMethod, testConfig } of methodTests) {
        it(`${httpMethod.toUpperCase()} ${url} отвечает корректно`, async () => {
            const { statusCode, body } = await httpRequest(
                httpMethod, url, testConfig.request
            );

            expect(statusCode).toBe(testConfig.expect.status);

            if (typeof testConfig.expect.body === 'function') {
                const responseData = statusCode < 400 ? body.response : body.error;
                expect(testConfig.expect.body(responseData)).toBe(true);
            } else {
                expect(body.response).toEqual(testConfig.expect.body);
            }
        });
    }
});
