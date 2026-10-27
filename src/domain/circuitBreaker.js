/**
 * Circuit breaker with exponential backoff for calls to a remote dependency.
 *
 * After a failure the circuit opens and no request is allowed until the backoff
 * delay has elapsed (half-open). A success closes the circuit and resets the counter.
 */
export class CircuitBreaker {
    /**
     * @param {object} [options]
     * @param {number} [options.backoffBaseMs] base delay for exponential backoff
     * @param {number} [options.maxBackoffMs] upper bound for the delay
     * @param {() => number} [options.now] clock, injectable for tests
     */
    constructor({ backoffBaseMs = 1000, maxBackoffMs = 5 * 60_000, now = Date.now } = {}) {
        this.failures = 0;
        this.nextTry = 0;
        this.backoffBaseMs = backoffBaseMs;
        this.maxBackoffMs = maxBackoffMs;
        this.now = now;
    }

    /** @returns {'closed' | 'open' | 'half-open'} */
    get state() {
        if (this.failures === 0) return 'closed';
        return this.now() < this.nextTry ? 'open' : 'half-open';
    }

    /** @returns {boolean} true when a request may be attempted now */
    canRequest() {
        return this.state !== 'open';
    }

    recordSuccess() {
        this.failures = 0;
        this.nextTry = 0;
    }

    /**
     * Registers a failure and opens the circuit.
     * @returns {number} delay in ms before the next attempt is allowed
     */
    recordFailure() {
        this.failures += 1;
        const delay = Math.min(this.backoffBaseMs * 2 ** (this.failures - 1), this.maxBackoffMs);
        this.nextTry = this.now() + delay;
        return delay;
    }
}
