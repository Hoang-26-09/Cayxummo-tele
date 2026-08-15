// ==================== RATE LIMITER ====================
export class RateLimiter {
    constructor() {
        this.requests = new Map();
    }

    check(key, maxRequests = 10, timeWindow = 60000) {
        const now = Date.now();
        if (!this.requests.has(key)) {
            this.requests.set(key, []);
        }
        const timestamps = this.requests.get(key);
        const valid = timestamps.filter(t => now - t < timeWindow);
        if (valid.length >= maxRequests) {
            return false;
        }
        valid.push(now);
        this.requests.set(key, valid);
        return true;
    }
}

export const rateLimiter = new RateLimiter();
