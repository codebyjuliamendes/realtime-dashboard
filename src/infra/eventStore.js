import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * @typedef {import('../services/eventHub.js').DashboardEvent} DashboardEvent
 */

/**
 * Append-only SQLite event log (built-in `node:sqlite`, Node >= 22.13).
 *
 * @param {{ filePath: string, logger: import('../logger.js').Logger }} options
 */
export function createEventStore({ filePath, logger }) {
    if (filePath !== ':memory:') {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    const db = new DatabaseSync(filePath);
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS event_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            payload TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_timestamp ON event_log(timestamp);
    `);

    const insertStmt = db.prepare('INSERT INTO event_log (type, timestamp, payload) VALUES (?, ?, ?)');
    const rangeStmt = db.prepare(
        'SELECT payload FROM event_log WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC, id ASC LIMIT ?',
    );
    const pruneStmt = db.prepare('DELETE FROM event_log WHERE timestamp < ?');
    const pingStmt = db.prepare('SELECT 1 AS ok');
    let open = true;

    return {
        /** @param {DashboardEvent} event @returns {boolean} */
        append(event) {
            try {
                insertStmt.run(event.type, event.timestamp, JSON.stringify(event));
                return true;
            } catch (error) {
                logger.error({ err: error, type: event.type }, 'failed to append event');
                return false;
            }
        },

        /**
         * @param {number} start epoch ms, inclusive
         * @param {number} end epoch ms, inclusive
         * @param {number} limit
         * @returns {DashboardEvent[]}
         */
        getRange(start, end, limit) {
            const rows = /** @type {{ payload: string }[]} */ (
                /** @type {unknown} */ (rangeStmt.all(start, end, limit))
            );
            return rows.map((row) => JSON.parse(row.payload));
        },

        /** @param {number} olderThanMs @returns {number} rows removed */
        prune(olderThanMs) {
            const result = pruneStmt.run(olderThanMs);
            return Number(result.changes);
        },

        /** @returns {boolean} */
        ping() {
            if (!open) return false;
            try {
                return /** @type {{ ok: number }} */ (pingStmt.get())?.ok === 1;
            } catch {
                return false;
            }
        },

        close() {
            if (!open) return;
            open = false;
            db.close();
        },
    };
}

/** @typedef {ReturnType<typeof createEventStore>} EventStore */
