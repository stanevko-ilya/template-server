/**
 * Rate limiter на основе token bucket.
 * Пополняет токены с частотой rps/сек; acquire() ждёт доступный токен перед отправкой запроса.
 */
export class RateLimiter {
    #tokens: number;
    #maxTokens: number;
    #refillRate: number; // токенов в миллисекунду
    #lastRefill: number;
    #acquireTimes: number[] = []; // timestamps последних acquire для измерения фактического RPS

    /**
     * @param rps Целевая скорость запросов в секунду
     * @param maxTokens Максимальный запас токенов (для обработки всплесков)
     */
    constructor(rps: number, maxTokens = 30) {
        this.#maxTokens = maxTokens;
        this.#tokens = maxTokens;
        this.#refillRate = rps / 1000;
        this.#lastRefill = Date.now();
    }

    /** Фактический RPS за последнее окно (по умолчанию 1с) */
    getRps(windowMs = 1000): number {
        const cutoff = Date.now() - windowMs;
        let i = 0;
        while (i < this.#acquireTimes.length && this.#acquireTimes[i] < cutoff) i++;
        if (i > 0) this.#acquireTimes.splice(0, i);
        return (this.#acquireTimes.length * 1000) / windowMs;
    }

    /** Пополнить токены на основе прошедшего времени */
    #refill(): void {
        const now = Date.now();
        const elapsed = now - this.#lastRefill;
        this.#tokens = Math.min(this.#maxTokens, this.#tokens + elapsed * this.#refillRate);
        this.#lastRefill = now;
    }

    /** Ожидать доступный токен. Резолвится, когда можно отправлять запрос. */
    async acquire(): Promise<void> {
        this.#refill();

        if (this.#tokens >= 1) {
            this.#tokens -= 1;
            this.#acquireTimes.push(Date.now());
            return;
        }

        const waitMs = Math.ceil((1 - this.#tokens) / this.#refillRate);
        await new Promise((resolve) => setTimeout(resolve, waitMs));

        this.#refill();
        this.#tokens -= 1;
        this.#acquireTimes.push(Date.now());
    }
}

export default RateLimiter;
