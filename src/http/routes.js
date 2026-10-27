import { Router } from 'express';
import { parseHistoryQuery } from '../domain/historyQuery.js';

/**
 * @param {object} deps
 * @param {import('../config.js').AppConfig} deps.config
 * @param {import('../services/eventHub.js').EventHub} deps.hub
 * @param {import('../infra/eventStore.js').EventStore} deps.store
 * @param {() => Record<string, unknown>} deps.getStatus
 */
export function createApiRouter({ config, hub, store, getStatus }) {
    const router = Router();

    /**
     * GET /api/history
     *   ?limit=N              most recent N events from memory (default 100)
     *   ?start=ms&end=ms      events persisted in SQLite between two epoch-ms timestamps
     */
    router.get('/history', (req, res) => {
        const query = parseHistoryQuery(/** @type {Record<string, unknown>} */ (req.query), {
            maxLimit: config.historyMaxLimit,
            defaultLimit: 100,
            maxRangeMs: config.historyMaxRangeMs,
        });
        const data =
            query.mode === 'range' ? store.getRange(query.start, query.end, query.limit) : hub.getRecent(query.limit);
        res.set('Cache-Control', 'no-store');
        res.json({ status: 'success', count: data.length, data });
    });

    /** GET /api/status — where each panel's data comes from and the feed health. */
    router.get('/status', (_req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({ status: 'success', data: getStatus() });
    });

    return router;
}
