import pino from 'pino';

/**
 * Structured JSON logger (pino). One line per event, ready for log aggregation.
 * @param {{ logLevel: string }} config
 */
export function createLogger({ logLevel }) {
    return pino({
        level: logLevel,
        base: { service: 'realtime-dashboard' },
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: { paths: ['req.headers.cookie', 'req.headers.authorization', '*.apiKey'], remove: true },
    });
}

/** @typedef {import('pino').Logger} Logger */
