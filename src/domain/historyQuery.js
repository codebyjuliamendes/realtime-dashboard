import { HttpError } from './errors.js';

/**
 * @typedef {{ mode: 'range', start: number, end: number, limit: number }} RangeQuery
 * @typedef {{ mode: 'recent', limit: number }} RecentQuery
 */

const INTEGER = /^-?\d{1,16}$/;

/**
 * @param {unknown} raw
 * @param {string} name
 * @returns {number | undefined}
 */
function parseInteger(raw, name) {
    if (raw === undefined || raw === '') return undefined;
    if (typeof raw !== 'string' || !INTEGER.test(raw)) {
        throw new HttpError(400, `Query parameter "${name}" must be an integer`);
    }
    return Number(raw);
}

/**
 * Validates `GET /api/history` query parameters.
 *
 * @param {Record<string, unknown>} query
 * @param {{ maxLimit: number, defaultLimit: number, maxRangeMs: number }} limits
 * @returns {RangeQuery | RecentQuery}
 */
export function parseHistoryQuery(query, { maxLimit, defaultLimit, maxRangeMs }) {
    const start = parseInteger(query.start, 'start');
    const end = parseInteger(query.end, 'end');
    const limitRaw = parseInteger(query.limit, 'limit');

    if (limitRaw !== undefined && (limitRaw < 1 || limitRaw > maxLimit)) {
        throw new HttpError(400, `Query parameter "limit" must be between 1 and ${maxLimit}`);
    }
    const limit = limitRaw ?? defaultLimit;

    if (start === undefined && end === undefined) {
        return { mode: 'recent', limit };
    }
    if (start === undefined || end === undefined) {
        throw new HttpError(400, 'Query parameters "start" and "end" must be provided together');
    }
    if (start < 0 || end < 0) {
        throw new HttpError(400, 'Timestamps must be non-negative epoch milliseconds');
    }
    if (start > end) {
        throw new HttpError(400, '"start" must be less than or equal to "end"');
    }
    if (end - start > maxRangeMs) {
        throw new HttpError(400, `Time range must not exceed ${maxRangeMs} ms`);
    }
    return { mode: 'range', start, end, limit };
}
