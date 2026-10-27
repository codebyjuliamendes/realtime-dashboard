/**
 * Error carrying an HTTP status code and a message that is safe to show to clients.
 */
export class HttpError extends Error {
    /**
     * @param {number} status
     * @param {string} message
     * @param {Record<string, unknown>} [details]
     */
    constructor(status, message, details) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.details = details;
        this.expose = status < 500;
    }
}

/**
 * Raised when environment configuration is invalid at boot.
 */
export class ConfigError extends Error {
    /** @param {string[]} problems */
    constructor(problems) {
        super(`Invalid configuration:\n - ${problems.join('\n - ')}`);
        this.name = 'ConfigError';
        this.problems = problems;
    }
}
