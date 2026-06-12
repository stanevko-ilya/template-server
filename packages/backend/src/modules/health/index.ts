import http from 'node:http';
import { Module } from '../_class.js';
import modules from '../../modules.js';
import config, { type HealthConfig } from './config.js';

/**
 * Минимальный HTTP-сервер для health check.
 * Отвечает на GET /api/ping — используется в процессах, где модуль api не запущен
 * (например, notifier), чтобы балансировщик мог проверять живость инстанса.
 */
export class Health extends Module<HealthConfig> {
    #server: http.Server | null = null;

    constructor() {
        super(import.meta.dirname, config);
    }

    protected async startFunction(): Promise<void> {
        const port = Number(this.getConfig().port) || 3001;

        const server = http.createServer((req, res) => {
            if (req.method === 'GET' && req.url === '/api/ping') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ response: { ok: true } }));
            } else {
                res.writeHead(404);
                res.end();
            }
        });
        this.#server = server;

        await new Promise<void>((resolve) => {
            server.listen(port, () => {
                modules.logger?.info(`[health] HTTP сервер запущен, порт: ${port}`);
                resolve();
            });
        });
    }

    protected async stopFunction(): Promise<void> {
        if (this.#server) {
            const server = this.#server;
            await new Promise<void>((resolve) => server.close(() => resolve()));
            this.#server = null;
        }
    }
}

export default Health;
