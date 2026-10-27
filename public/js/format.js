// Pure formatting / classification helpers (no DOM), unit tested under Node.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/**
 * @param {unknown} value
 * @param {{ simulated?: boolean }} [options] simulated values are shown without a currency sign
 * @returns {string}
 */
export function formatPrice(value, { simulated = false } = {}) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return simulated ? `${plain.format(value)} (sim.)` : usd.format(value);
}

/**
 * @param {number | null | undefined} value
 * @param {string} unit
 */
export function formatMetric(value, unit) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return `${value.toFixed(1)} ${unit}`;
}

/** @param {number} ms */
export function formatClock(ms) {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
}

/** 24-hour clock with milliseconds, e.g. 22:15:52.313 (event log). @param {number} ms */
export function formatClockMs(ms) {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (/** @type {number} */ n, w = 2) => String(n).padStart(w, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/**
 * Percentage change from `base` to `value`.
 * @param {number} value
 * @param {number} base
 * @returns {number | null}
 */
export function percentChange(value, base) {
    if (!Number.isFinite(value) || !Number.isFinite(base) || base === 0) return null;
    return ((value - base) / base) * 100;
}

const SYMBOLS = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL' };

/**
 * Text shown in the "Details" column of the event log.
 * @param {{ type: string, data?: unknown, message?: string }} event
 */
export function describeEvent(event) {
    if (event.message) return event.message;
    if (event.type === 'CRYPTO' && event.data && typeof event.data === 'object') {
        const d = /** @type {Record<string, { usd?: number }>} */ (event.data);
        return Object.entries(SYMBOLS)
            .filter(([id]) => typeof d[id]?.usd === 'number')
            .map(([id, symbol]) => `${symbol} ${d[id].usd}`)
            .join(' · ');
    }
    if (event.type === 'IOT' && event.data && typeof event.data === 'object') {
        const d = /** @type {{ temperature?: number, humidity?: number, cpuUsage?: number }} */ (event.data);
        return `temp ${d.temperature?.toFixed(1)} °C · hum ${d.humidity?.toFixed(1)} % · cpu ${d.cpuUsage?.toFixed(1)} %`;
    }
    return event.data === undefined ? '' : JSON.stringify(event.data);
}

/** Tailwind classes per event type (complete strings so the Tailwind build keeps them). */
const TYPE_CLASSES = {
    CRYPTO: 'text-amber-300',
    IOT: 'text-cyan-300',
    SYSTEM: 'text-slate-300',
    SYSTEM_ERROR: 'text-red-300',
};

/** @param {string} type */
export function typeClass(type) {
    return TYPE_CLASSES[/** @type {keyof typeof TYPE_CLASSES} */ (type)] ?? 'text-slate-300';
}

/**
 * @typedef {'live' | 'simulated' | 'stale' | 'unavailable' | 'waiting' | 'off'} SourceState
 */

/** Badge text and classes per source state. */
export const BADGES = {
    live: { text: 'Live', className: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' },
    simulated: { text: 'Simulated data', className: 'border-amber-400/50 bg-amber-400/10 text-amber-200' },
    stale: { text: 'Stale', className: 'border-orange-400/50 bg-orange-400/10 text-orange-200' },
    unavailable: { text: 'Unavailable', className: 'border-red-400/50 bg-red-400/10 text-red-200' },
    waiting: { text: 'Waiting for data', className: 'border-slate-400/40 bg-slate-400/10 text-slate-300' },
    off: { text: 'Disabled', className: 'border-slate-500/40 bg-slate-500/10 text-slate-400' },
};

/**
 * Derives the crypto panel state from what the client knows.
 * @param {object} input
 * @param {'coingecko' | 'demo' | 'off' | undefined} input.configuredSource
 * @param {{ isSimulated: boolean, at: number } | null} input.lastPrice price flag and its source time (epoch ms)
 * @param {boolean} input.lastFetchFailed
 * @param {number} input.now
 * @param {number} [input.staleAfterMs]
 * @returns {SourceState}
 */
export function cryptoState({ configuredSource, lastPrice, lastFetchFailed, now, staleAfterMs = 5 * 60_000 }) {
    if (configuredSource === 'off') return 'off';
    if (lastPrice?.isSimulated) return 'simulated';
    if (lastFetchFailed) return lastPrice ? 'stale' : 'unavailable';
    if (!lastPrice) return 'waiting';
    return now - lastPrice.at > staleAfterMs ? 'stale' : 'live';
}
