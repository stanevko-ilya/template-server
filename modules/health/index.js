const http = require('http');
const Module = require('../_class');
const modules = require('../../modules');

/**
 * @description Минимальный HTTP-сервер для health check.
 * Отвечает на GET /api/ping — используется в процессах, где модуль api не запущен
 * (например, notifier), чтобы балансировщик мог проверять живость инстанса.
 */
class Health extends Module {
    #server;

    constructor() { super(__dirname, './config.json'); }

    async startFunction() {
        const port = Number(this.getConfig().port) || 3001;

        this.#server = http.createServer((req, res) => {
            if (req.method === 'GET' && req.url === '/api/ping') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ response: { ok: true } }));
            } else {
                res.writeHead(404);
                res.end();
            }
        });

        await new Promise(resolve => {
            this.#server.listen(port, () => {
                modules.logger?.info(`[health] HTTP сервер запущен, порт: ${port}`);
                resolve();
            });
        });
    }

    async stopFunction() {
        if (this.#server) await new Promise(resolve => this.#server.close(resolve));
    }
}

module.exports = Health;
