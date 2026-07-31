import { WebSocketServer, WebSocket } from 'ws';
import { eventStore } from './eventStore.js';

/**
 * @typedef {Object} SystemEvent
 * @property {string} type
 * @property {number} timestamp
 * @property {any} [data]
 * @property {string} [message]
 * @property {boolean} [isSimulated]
 */

class WebSocketService {
    constructor() {
        this.clients = new Set();
        this.eventLog = [];
        this.MAX_LOG_SIZE = 100000;
        this.wss = null;
        
        // Backpressure batching
        this.batchQueue = [];
        this.batchIntervalMs = 50;
        this.batchTimer = null;
    }

    /**
     * Initializes the WebSocket Server.
     * @param {import('http').Server} server 
     */
    init(server) {
        this.wss = new WebSocketServer({ server });

        this.wss.on('connection', (ws) => {
            this.clients.add(ws);
            
            ws.send(JSON.stringify({ type: 'SYSTEM', message: 'Connected to Real-Time Dashboard Server', timestamp: Date.now() }));
            
            ws.on('close', () => {
                this.clients.delete(ws);
            });
            
            ws.on('error', (err) => {
                console.error('WebSocket client error:', err);
            });
        });

        this.batchTimer = setInterval(() => this._flushBatch(), this.batchIntervalMs);
    }

    /**
     * Broadcasts a message to all connected clients.
     * @param {SystemEvent} data 
     */
    broadcast(data) {
        if (!data.timestamp) data.timestamp = Date.now();
        
        // Store in SQLite event sourcing
        eventStore.append(data);
        
        // Queue for backpressure batching
        this.batchQueue.push(data);
        
        this.eventLog.push(data);
        if (this.eventLog.length > this.MAX_LOG_SIZE) {
            this.eventLog.shift();
        }
    }

    _flushBatch() {
        if (this.batchQueue.length === 0) return;
        
        // Wrap in a BATCH event type
        const payload = JSON.stringify({ type: 'BATCH', events: this.batchQueue });
        
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        }
        
        this.batchQueue = [];
    }

    /**
     * Retrieves recent event history.
     * @param {number} limit 
     * @returns {SystemEvent[]}
     */
    getHistory(limit = 100) {
        return this.eventLog.slice(-limit);
    }
}

export const wsService = new WebSocketService();
