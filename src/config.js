import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError } from './domain/errors.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {object} AppConfig
 * @property {'development' | 'production' | 'test'} nodeEnv
 * @property {string} host
 * @property {number} port
 * @property {string} logLevel
 * @property {string} dataDir directory for the SQLite event store
 * @property {string} dbFile absolute path of the SQLite file (":memory:" allowed)
 * @property {number} retentionHours events older than this are pruned
 * @property {'coingecko' | 'demo' | 'off'} cryptoSource
 * @property {number} cryptoPollMs
 * @property {string} coingeckoBaseUrl
 * @property {string | undefined} coingeckoApiKey optional CoinGecko demo API key
 * @property {number} upstreamTimeoutMs
 * @property {'simulated' | 'off'} iotSource
 * @property {number} iotIntervalMs
 * @property {number} wsBatchMs
 * @property {number} wsHeartbeatMs
 * @property {string[]} allowedOrigins extra origins allowed for WebSocket/CORS
 * @property {number} historyBufferSize in-memory events kept for `/api/history?limit=`
 * @property {number} historyMaxLimit
 * @property {number} historyMaxRangeMs
 * @property {number} rateLimitPerMinute requests per IP per minute on /api
 * @property {string | number | boolean} trustProxy express "trust proxy" setting
 * @property {number} shutdownTimeoutMs
 * @property {string} rootDir
 */

/**
 * @param {Record<string, string | undefined>} env
 * @param {string[]} problems
 */
function reader(env, problems) {
    return {
        /** @param {string} key @param {number} fallback @param {number} min @param {number} max */
        int(key, fallback, min, max) {
            const raw = env[key];
            if (raw === undefined || raw.trim() === '') return fallback;
            const value = Number(raw);
            if (!Number.isInteger(value) || value < min || value > max) {
                problems.push(`${key} must be an integer between ${min} and ${max} (got "${raw}")`);
                return fallback;
            }
            return value;
        },
        /**
         * @template {string} T
         * @param {string} key @param {T} fallback @param {readonly T[]} allowed
         * @returns {T}
         */
        oneOf(key, fallback, allowed) {
            const raw = env[key];
            if (raw === undefined || raw.trim() === '') return fallback;
            const value = /** @type {T} */ (raw.trim().toLowerCase());
            if (!allowed.includes(value)) {
                problems.push(`${key} must be one of ${allowed.join(', ')} (got "${raw}")`);
                return fallback;
            }
            return value;
        },
        /** @param {string} key @param {string} fallback */
        str(key, fallback) {
            const raw = env[key];
            return raw === undefined || raw.trim() === '' ? fallback : raw.trim();
        },
    };
}

/**
 * @param {string} raw
 * @returns {string | number | boolean}
 */
function parseTrustProxy(raw) {
    if (raw === 'true') return true;
    if (raw === 'false' || raw === '') return false;
    if (/^\d+$/.test(raw)) return Number(raw);
    return raw;
}

/**
 * Reads and validates configuration from environment variables. Fails fast with a
 * single error listing every problem.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {AppConfig}
 */
export function loadConfig(env = process.env) {
    /** @type {string[]} */
    const problems = [];
    const r = reader(env, problems);

    const nodeEnv = r.oneOf('NODE_ENV', 'development', /** @type {const} */ (['development', 'production', 'test']));
    const dataDir = path.resolve(ROOT_DIR, r.str('DATA_DIR', 'data'));
    const dbFileRaw = r.str('DB_FILE', 'events.db');
    const dbFile = dbFileRaw === ':memory:' ? ':memory:' : path.resolve(dataDir, dbFileRaw);

    const allowedOrigins = r
        .str('ALLOWED_ORIGINS', '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    for (const origin of allowedOrigins) {
        try {
            const url = new URL(origin);
            if (url.origin !== origin) throw new Error('not an origin');
        } catch {
            problems.push(`ALLOWED_ORIGINS entry "${origin}" must be an origin such as https://example.com`);
        }
    }

    const coingeckoBaseUrl = r.str('COINGECKO_BASE_URL', 'https://api.coingecko.com/api/v3');
    try {
        const url = new URL(coingeckoBaseUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    } catch {
        problems.push(`COINGECKO_BASE_URL must be an http(s) URL (got "${coingeckoBaseUrl}")`);
    }

    /** @type {AppConfig} */
    const config = {
        nodeEnv,
        host: r.str('HOST', '0.0.0.0'),
        port: r.int('PORT', 3001, 0, 65535),
        logLevel: r.oneOf(
            'LOG_LEVEL',
            nodeEnv === 'test' ? 'silent' : 'info',
            /** @type {const} */ (['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
        ),
        dataDir,
        dbFile,
        retentionHours: r.int('RETENTION_HOURS', 24, 1, 24 * 365),
        cryptoSource: r.oneOf('CRYPTO_SOURCE', 'coingecko', /** @type {const} */ (['coingecko', 'demo', 'off'])),
        cryptoPollMs: r.int('CRYPTO_POLL_MS', 30_000, 1_000, 3_600_000),
        coingeckoBaseUrl: coingeckoBaseUrl.replace(/\/+$/, ''),
        coingeckoApiKey: env.COINGECKO_API_KEY?.trim() || undefined,
        upstreamTimeoutMs: r.int('UPSTREAM_TIMEOUT_MS', 8_000, 500, 60_000),
        iotSource: r.oneOf('IOT_SOURCE', 'simulated', /** @type {const} */ (['simulated', 'off'])),
        iotIntervalMs: r.int('IOT_INTERVAL_MS', 250, 50, 60_000),
        wsBatchMs: r.int('WS_BATCH_MS', 50, 10, 5_000),
        wsHeartbeatMs: r.int('WS_HEARTBEAT_MS', 30_000, 1_000, 600_000),
        allowedOrigins,
        historyBufferSize: r.int('HISTORY_BUFFER_SIZE', 10_000, 100, 1_000_000),
        historyMaxLimit: r.int('HISTORY_MAX_LIMIT', 5_000, 1, 100_000),
        historyMaxRangeMs: r.int('HISTORY_MAX_RANGE_MS', 60 * 60_000, 1_000, 7 * 24 * 60 * 60_000),
        rateLimitPerMinute: r.int('RATE_LIMIT_PER_MINUTE', 120, 1, 100_000),
        trustProxy: parseTrustProxy(r.str('TRUST_PROXY', 'false')),
        shutdownTimeoutMs: r.int('SHUTDOWN_TIMEOUT_MS', 10_000, 100, 120_000),
        rootDir: ROOT_DIR,
    };

    if (problems.length > 0) throw new ConfigError(problems);
    return config;
}
