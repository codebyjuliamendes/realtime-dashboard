import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '../../events.db');

class EventStore {
    constructor() {
        this.db = new DatabaseSync(dbPath);
        this.init();
    }

    init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                payload TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_timestamp ON event_log(timestamp);
        `);
        this.insertStmt = this.db.prepare('INSERT INTO event_log (type, timestamp, payload) VALUES (?, ?, ?)');
    }

    /**
     * @param {Object} event
     */
    append(event) {
        try {
            this.insertStmt.run(event.type, event.timestamp, JSON.stringify(event));
        } catch (error) {
            console.error('Failed to append event to store:', error);
        }
    }

    /**
     * @param {number} startTime 
     * @param {number} endTime 
     * @returns {Object[]}
     */
    getHistory(startTime, endTime) {
        const stmt = this.db.prepare('SELECT payload FROM event_log WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC');
        const rows = stmt.all(startTime, endTime);
        return rows.map(row => JSON.parse(row.payload));
    }
}

export const eventStore = new EventStore();
