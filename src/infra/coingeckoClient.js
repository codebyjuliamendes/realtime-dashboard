import { COINS, parseCoinGeckoPrices } from '../domain/crypto.js';

/**
 * Minimal CoinGecko client for the public `/simple/price` endpoint.
 *
 * @param {object} options
 * @param {string} options.baseUrl
 * @param {string} [options.apiKey] optional CoinGecko demo key (sent as x-cg-demo-api-key)
 * @param {number} options.timeoutMs
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createCoinGeckoClient({ baseUrl, apiKey, timeoutMs, fetchImpl = fetch }) {
    const url = `${baseUrl}/simple/price?ids=${COINS.join(',')}&vs_currencies=usd&include_last_updated_at=true`;
    /** @type {Record<string, string>} */
    const headers = { Accept: 'application/json', 'User-Agent': 'realtime-dashboard' };
    if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

    return {
        /** @returns {Promise<import('../domain/crypto.js').CryptoQuotes>} */
        async fetchPrices() {
            const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
            if (!response.ok) {
                throw new Error(`CoinGecko responded with HTTP ${response.status}`);
            }
            return parseCoinGeckoPrices(await response.json());
        },
    };
}
