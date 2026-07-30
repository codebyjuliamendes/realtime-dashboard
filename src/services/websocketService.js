import { WebSocketServer, WebSocket } from 'ws';

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
    }

    /**
     * Broadcasts a message to all connected clients.
     * @param {SystemEvent} data 
     */
    broadcast(data) {
        if (!data.timestamp) data.timestamp = Date.now();
        const payload = JSON.stringify(data);
        
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        }
        
        this.eventLog.push(data);
        if (this.eventLog.length > this.MAX_LOG_SIZE) {
            this.eventLog.shift();
        }
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
