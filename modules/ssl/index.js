const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const acme = require('acme-client');

const Module = require('../_class');
const modules = require('../../modules');

class SSL extends Module {
    /** @type {{ key: Buffer, cert: Buffer, ca?: Buffer }|null} */
    #credentials = null;

    /** @type {Map<string, string>} */
    #challengeTokens = new Map();

    /** @type {http.Server|null} */
    #challengeServer = null;

    /** @type {NodeJS.Timeout|null} */
    #renewalTimer = null;

    constructor() { super(__dirname) }

    /**
     * @returns {{ key: Buffer, cert: Buffer, ca?: Buffer }|null}
     */
    getCredentials() { return this.#credentials }

    /**
     * @description Директория для хранения сертификатов (внутри модуля)
     */
    get #certsDir() { return path.join(this.getDirname(), 'certs') }

    #info(msg) { modules.logger?.info(`[SSL] ${msg}`) }
    #warn(msg) { modules.logger?.warn(`[SSL] ${msg}`) }
    #error(msg) { modules.logger?.error(`[SSL] ${msg}`) }

    async startFunction() {
        const mode = (this.getConfig().mode || 'off').toLowerCase();

        switch (mode) {
            case 'file':
                this.#loadFromFiles();
                break;
            case 'letsencrypt':
                await this.#initLetsEncrypt();
                break;
            case 'off':
            case '':
                this.#info('SSL отключен (SSL_MODE=off)');
                break;
            default:
                this.#warn(`Неизвестный SSL_MODE: ${mode}, SSL отключен`);
        }
    }

    async stopFunction() {
        if (this.#renewalTimer) {
            clearInterval(this.#renewalTimer);
            this.#renewalTimer = null;
        }
        await this.#stopChallengeServer();
        this.#credentials = null;
    }

    // ── Режим file ──────────────────────────────────────────────

    #loadFromFiles() {
        const { key: keyPath, cert: certPath, ca: caPath } = this.getConfig().file;

        if (!keyPath || !certPath) {
            this.#error('SSL_MODE=file, но SSL_KEY_PATH или SSL_CERT_PATH не указаны');
            return;
        }

        try {
            const credentials = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath),
            };

            if (caPath) {
                try { credentials.ca = fs.readFileSync(caPath) }
                catch (_e) { this.#warn(`CA bundle не найден: ${caPath}`) }
            }

            this.#credentials = credentials;
            this.#info('Сертификаты загружены из файлов');
        } catch (e) {
            this.#error(`Ошибка загрузки SSL файлов: ${e.message}`);
        }
    }

    // ── Режим letsencrypt ───────────────────────────────────────

    async #initLetsEncrypt() {
        const { domain, email, staging } = this.getConfig().letsencrypt;

        if (!domain || !email) {
            this.#error('SSL_MODE=letsencrypt, но SSL_DOMAIN или SSL_EMAIL не указаны');
            return;
        }

        await fsp.mkdir(this.#certsDir, { recursive: true });

        const keyPath = path.join(this.#certsDir, 'privkey.pem');
        const certPath = path.join(this.#certsDir, 'fullchain.pem');
        const accountKeyPath = path.join(this.#certsDir, 'account.pem');

        // Загрузка существующих или запрос новых
        if (await this.#loadExistingCerts(keyPath, certPath)) {
            this.#info('Загружены существующие сертификаты');
            if (this.#shouldRenew(certPath)) {
                this.#info('Сертификат скоро истекает, обновляю...');
                await this.#requestCertificate(domain, email, accountKeyPath, keyPath, certPath, staging);
            }
        } else {
            this.#info(`Запрашиваю сертификат для ${domain}...`);
            await this.#requestCertificate(domain, email, accountKeyPath, keyPath, certPath, staging);
        }

        // Автообновление
        const interval = this.getConfig().letsencrypt.renewCheckInterval || 12 * 60 * 60 * 1000;
        this.#renewalTimer = setInterval(async () => {
            if (this.#shouldRenew(certPath)) {
                this.#info('Автоматическое обновление сертификата...');
                await this.#requestCertificate(domain, email, accountKeyPath, keyPath, certPath, staging);
            }
        }, interval);
        this.#renewalTimer.unref();
    }

    async #loadExistingCerts(keyPath, certPath) {
        try {
            this.#credentials = {
                key: await fsp.readFile(keyPath),
                cert: await fsp.readFile(certPath),
            };
            return true;
        } catch (_e) {
            return false;
        }
    }

    #shouldRenew(certPath) {
        try {
            const certPem = fs.readFileSync(certPath, 'utf-8');
            const cert = new crypto.X509Certificate(certPem);
            const daysLeft = (new Date(cert.validTo) - Date.now()) / (1000 * 60 * 60 * 24);
            this.#info(`Сертификат: осталось ${Math.floor(daysLeft)} дней`);
            return daysLeft < 30;
        } catch (_e) {
            return true;
        }
    }

    async #requestCertificate(domain, email, accountKeyPath, keyPath, certPath, staging) {
        try {
            // Account key
            let accountKey;
            try {
                accountKey = await fsp.readFile(accountKeyPath);
            } catch (_e) {
                accountKey = await acme.crypto.createPrivateKey();
                await fsp.writeFile(accountKeyPath, accountKey);
            }

            const client = new acme.Client({
                directoryUrl: staging
                    ? acme.directory.letsencrypt.staging
                    : acme.directory.letsencrypt.production,
                accountKey,
            });

            await client.createAccount({
                termsOfServiceAgreed: true,
                contact: [`mailto:${email}`],
            });

            const [domainKey, csr] = await acme.crypto.createCsr({
                commonName: domain,
            });

            await this.#startChallengeServer();

            const cert = await client.auto({
                csr,
                email,
                termsOfServiceAgreed: true,
                challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
                    if (challenge.type === 'http-01') {
                        this.#challengeTokens.set(challenge.token, keyAuthorization);
                    }
                },
                challengeRemoveFn: async (_authz, challenge) => {
                    if (challenge.type === 'http-01') {
                        this.#challengeTokens.delete(challenge.token);
                    }
                },
                challengePriority: ['http-01'],
            });

            await this.#stopChallengeServer();

            await fsp.writeFile(keyPath, domainKey);
            await fsp.writeFile(certPath, cert);

            this.#credentials = {
                key: domainKey,
                cert: Buffer.from(cert),
            };

            this.#info(`Сертификат для ${domain} получен и сохранён`);
        } catch (e) {
            await this.#stopChallengeServer();
            this.#error(`Ошибка Let's Encrypt: ${e.message}`);
        }
    }

    // ── Challenge server ────────────────────────────────────────

    async #startChallengeServer() {
        if (this.#challengeServer) return;

        return new Promise((resolve) => {
            this.#challengeServer = http.createServer((req, res) => {
                const prefix = '/.well-known/acme-challenge/';
                if (req.url?.startsWith(prefix)) {
                    const token = req.url.slice(prefix.length);
                    const keyAuth = this.#challengeTokens.get(token);
                    if (keyAuth) {
                        this.#info(`Challenge обработан: ${token}`);
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end(keyAuth);
                        return;
                    }
                }
                res.writeHead(404);
                res.end();
            });

            this.#challengeServer.listen(80, () => {
                this.#info('ACME challenge-сервер запущен на порту 80');
                resolve();
            });
        });
    }

    async #stopChallengeServer() {
        if (!this.#challengeServer) return;
        return new Promise((resolve) => {
            this.#challengeServer.close(() => {
                this.#challengeServer = null;
                this.#challengeTokens.clear();
                resolve();
            });
        });
    }
}

module.exports = SSL;
