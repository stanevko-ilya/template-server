/**
 * @description Rate limiter на основе token bucket
 * Контролирует скорость отправки запросов (например, к внешним API)
 *
 * Принцип: пополняет токены с заданной частотой (rps штук в секунду).
 * acquire() ждёт доступный токен перед отправкой запроса.
 */
class RateLimiter {
    #tokens;
    #maxTokens;
    #refillRate; // токенов в миллисекунду
    #lastRefill;
    #acquireTimes = []; // timestamps последних acquire для измерения фактического RPS

    /**
     * @param {number} rps - Целевая скорость запросов в секунду
     * @param {number} maxTokens - Максимальный запас токенов (для обработки всплесков)
     */
    constructor(rps, maxTokens = 30) {
        this.#maxTokens = maxTokens;
        this.#tokens = maxTokens;
        this.#refillRate = rps / 1000;
        this.#lastRefill = Date.now();
    }

    /**
     * @description Возвращает фактический RPS за последнее окно (по умолчанию 1с)
     */
    getRps(windowMs = 1000) {
        const cutoff = Date.now() - windowMs;
        let i = 0;
        while (i < this.#acquireTimes.length && this.#acquireTimes[i] < cutoff) i++;
        if (i > 0) this.#acquireTimes.splice(0, i);
        return (this.#acquireTimes.length * 1000) / windowMs;
    }

    /**
     * @description Пополнить токены на основе прошедшего времени
     */
    #refill() {
        const now = Date.now();
        const elapsed = now - this.#lastRefill;
        this.#tokens = Math.min(this.#maxTokens, this.#tokens + elapsed * this.#refillRate);
        this.#lastRefill = now;
    }

    /**
     * @description Ожидать доступный токен. Резолвится когда можно отправлять запрос.
     * @returns {Promise<void>}
     */
    async acquire() {
        this.#refill();

        if (this.#tokens >= 1) {
            this.#tokens -= 1;
            this.#acquireTimes.push(Date.now());
            return;
        }

        // Рассчитать время ожидания до следующего токена
        const waitMs = Math.ceil((1 - this.#tokens) / this.#refillRate);
        await new Promise(resolve => setTimeout(resolve, waitMs));

        // После ожидания — пополнить и забрать токен
        this.#refill();
        this.#tokens -= 1;
        this.#acquireTimes.push(Date.now());
    }
}

module.exports = RateLimiter;
