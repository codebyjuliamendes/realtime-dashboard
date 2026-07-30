/**
 * Circuit Breaker pattern for remote API calls.
 */
export class CircuitBreaker {
    /**
     * @param {number} backoffBase - Base time in ms for exponential backoff
     * @param {number} maxBackoff - Max time in ms for exponential backoff
     */
    constructor(backoffBase = 100, maxBackoff = 30000) {
        this.failures = 0;
        this.isOpen = false;
        this.nextTry = 0;
        this.backoffBase = backoffBase;
        this.maxBackoff = maxBackoff;
    }

    /**
     * Checks if a request can proceed.
     * @returns {boolean} True if the request can proceed, false otherwise.
     */
    canRequest() {
        if (this.isOpen) {
            if (Date.now() < this.nextTry) {
                return false;
            }
        }
        return true;
    }

    /**
     * Records a successful request.
     */
    recordSuccess() {
        this.failures = 0;
        this.isOpen = false;
    }

    /**
     * Records a failed request and calculates the backoff time.
     * @returns {number} The delay until the next allowed request.
     */
    recordFailure() {
        this.failures++;
        this.isOpen = true;

        const delay = Math.min(
            this.backoffBase * Math.pow(2, this.failures - 1),
            this.maxBackoff
        );

        this.nextTry = Date.now() + delay;
        return delay;
    }
}
