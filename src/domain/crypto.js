/** Coins tracked by the dashboard, as CoinGecko ids. */
export const COINS = /** @type {const} */ (['bitcoin', 'ethereum', 'solana']);

/**
 * @typedef {{ usd: number, last_updated_at: number | null }} CoinQuote
 * @typedef {Record<string, CoinQuote>} CryptoQuotes
 */

/**
 * Validates and normalises a CoinGecko `/simple/price` response.
 * Only finite, positive prices are accepted; anything else is rejected instead of
 * being replaced by a placeholder, so the UI never shows a number that did not come
 * from the source.
 *
 * @param {unknown} body
 * @returns {CryptoQuotes}
 */
export function parseCoinGeckoPrices(body) {
    if (!body || typeof body !== 'object') {
        throw new Error('CoinGecko response is not an object');
    }
    const record = /** @type {Record<string, any>} */ (body);
    /** @type {CryptoQuotes} */
    const quotes = {};
    for (const coin of COINS) {
        const entry = record[coin];
        const usd = entry?.usd;
        if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) {
            continue;
        }
        const updated = entry.last_updated_at;
        quotes[coin] = {
            usd,
            last_updated_at: Number.isInteger(updated) && updated > 0 ? updated : null,
        };
    }
    if (Object.keys(quotes).length === 0) {
        throw new Error('CoinGecko response contains no valid prices');
    }
    return quotes;
}

/**
 * Builds a stable fingerprint used to detect whether CoinGecko published new data.
 * @param {CryptoQuotes} quotes
 */
export function quotesFingerprint(quotes) {
    return COINS.map((c) => `${c}:${quotes[c]?.usd ?? '-'}@${quotes[c]?.last_updated_at ?? '-'}`).join('|');
}

/**
 * Demo price generator: a bounded random walk around deliberately synthetic base
 * values (100 / 50 / 10) so simulated output cannot be mistaken for market prices.
 *
 * @param {() => number} [rng] uniform random in [0, 1)
 */
export function createDemoPriceWalk(rng = Math.random) {
    /** @type {Record<string, number>} */
    const bases = { bitcoin: 100, ethereum: 50, solana: 10 };
    const current = { ...bases };
    return {
        /** @param {number} nowMs @returns {CryptoQuotes} */
        next(nowMs) {
            /** @type {CryptoQuotes} */
            const quotes = {};
            for (const coin of COINS) {
                const drift = (rng() - 0.5) * 0.01 * bases[coin];
                const value = Math.min(bases[coin] * 1.5, Math.max(bases[coin] * 0.5, current[coin] + drift));
                current[coin] = value;
                quotes[coin] = { usd: Math.round(value * 100) / 100, last_updated_at: Math.floor(nowMs / 1000) };
            }
            return quotes;
        },
    };
}
