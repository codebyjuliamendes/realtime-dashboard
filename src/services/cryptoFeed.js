import { CircuitBreaker } from '../domain/circuitBreaker.js';
import { createDemoPriceWalk, quotesFingerprint } from '../domain/crypto.js';

/**
 * @typedef {object} CryptoFeedStatus
 * @property {'coingecko' | 'demo' | 'off'} source
 * @property {'idle' | 'ok' | 'degraded' | 'off'} state
 * @property {number | null} lastSuccessAt epoch ms of the last successful fetch
 * @property {string | null} lastError
 * @property {number | null} nextRetryAt
 */

/**
 * Short, client-safe description of a fetch failure (no stack, no URLs with keys).
 * @param {unknown} error
 */
function describeError(error) {
    if (!(error instanceof Error)) return 'unknown error';
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'request timed out';
    const cause = /** @type {{ code?: unknown }} */ (error.cause ?? {});
    return typeof cause.code === 'string' ? `${error.message} (${cause.code})` : error.message;
}

/**
 * Polls crypto prices and publishes them as CRYPTO events.
 *
 * - `coingecko`: real prices. On failure NO price is published; a SYSTEM_ERROR event is
 *   emitted and the circuit breaker backs off. The UI keeps the last real value and
 *   marks it as stale.
 * - `demo`: synthetic random walk, every event flagged `isSimulated: true`.
 * - `off`: nothing is published.
 *
 * @param {object} options
 * @param {'coingecko' | 'demo' | 'off'} options.source
 * @param {number} options.intervalMs
 * @param {import('./eventHub.js').EventHub} options.hub
 * @param {import('../logger.js').Logger} options.logger
 * @param {{ fetchPrices(): Promise<import('../domain/crypto.js').CryptoQuotes> }} [options.client]
 * @param {() => number} [options.now]
 * @param {() => number} [options.rng]
 */
export function createCryptoFeed({ source, intervalMs, hub, logger, client, now = Date.now, rng }) {
    if (source === 'coingecko' && !client) throw new Error('coingecko source requires a client');
    const breaker = new CircuitBreaker({ backoffBaseMs: intervalMs, maxBackoffMs: 10 * 60_000, now });
    const demo = createDemoPriceWalk(rng);
    /** @type {NodeJS.Timeout | null} */
    let timer = null;
    let inFlight = false;
    let lastFingerprint = '';

    /** @type {CryptoFeedStatus} */
    const status = {
        source,
        state: source === 'off' ? 'off' : 'idle',
        lastSuccessAt: null,
        lastError: null,
        nextRetryAt: null,
    };

    async function tick() {
        if (source === 'demo') {
            hub.publish({ type: 'CRYPTO', source: 'simulator', isSimulated: true, data: demo.next(now()) });
            status.state = 'ok';
            status.lastSuccessAt = now();
            return;
        }
        if (source !== 'coingecko' || !client || inFlight || !breaker.canRequest()) return;

        inFlight = true;
        try {
            const quotes = await client.fetchPrices();
            const recovered = status.state === 'degraded';
            breaker.recordSuccess();
            status.state = 'ok';
            status.lastSuccessAt = now();
            status.lastError = null;
            status.nextRetryAt = null;
            const fingerprint = quotesFingerprint(quotes);
            // CoinGecko refreshes roughly once a minute; only publish genuinely new data
            // (or re-publish after an outage so clients know the feed is healthy again).
            if (fingerprint !== lastFingerprint || recovered) {
                lastFingerprint = fingerprint;
                hub.publish({ type: 'CRYPTO', source: 'coingecko', isSimulated: false, data: quotes });
            }
        } catch (error) {
            const delay = breaker.recordFailure();
            const message = describeError(error);
            status.state = 'degraded';
            status.lastError = message;
            status.nextRetryAt = now() + delay;
            logger.warn({ err: error, retryInMs: delay }, 'crypto price fetch failed');
            hub.publish({
                type: 'SYSTEM_ERROR',
                source: 'coingecko',
                isSimulated: false,
                message: `Crypto prices unavailable (${message}). Next attempt in ${Math.round(delay / 1000)}s.`,
            });
        } finally {
            inFlight = false;
        }
    }

    return {
        start() {
            if (source === 'off' || timer) return;
            void tick();
            timer = setInterval(() => void tick(), intervalMs);
            timer.unref?.();
        },
        stop() {
            if (timer) clearInterval(timer);
            timer = null;
        },
        tick,
        /** @returns {CryptoFeedStatus} */
        getStatus() {
            return { ...status };
        },
    };
}
