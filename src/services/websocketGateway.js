import { WebSocketServer, WebSocket } from 'ws';

/** Clients whose send buffer exceeds this many bytes are skipped for a batch. */
const MAX_BUFFERED_BYTES = 1024 * 1024;

/**
 * Decides whether a WebSocket upgrade from `origin` is allowed. Browsers always send
 * an Origin header; non-browser clients (no Origin) are allowed. Same-host origins and
 * the explicit allow-list are accepted, which blocks cross-site WebSocket hijacking.
 *
 * @param {string | undefined} origin
 * @param {string | undefined} host
 * @param {string[]} allowedOrigins
 */
export function isOriginAllowed(origin, host, allowedOrigins) {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}

/**
 * Pushes hub events to browsers over WebSocket, batched every `batchMs`
 * ({ type: 'BATCH', events: [...] }), with heartbeat and slow-consumer protection.
 *
 * @param {object} options
 * @param {import('node:http').Server} options.server
 * @param {import('./eventHub.js').EventHub} options.hub
 * @param {import('../logger.js').Logger} options.logger
 * @param {number} options.batchMs
 * @param {number} options.heartbeatMs
 * @param {string[]} options.allowedOrigins
 * @param {() => Record<string, unknown>} options.getHello payload merged into the welcome message
 */
export function createWebSocketGateway({ server, hub, logger, batchMs, heartbeatMs, allowedOrigins, getHello }) {
    const wss = new WebSocketServer({
        server,
        maxPayload: 1024,
        verifyClient: ({ origin, req }, done) => {
            const ok = isOriginAllowed(origin, req.headers.host, allowedOrigins);
            if (!ok) logger.warn({ origin }, 'rejected websocket upgrade from disallowed origin');
            done(ok, 403, 'Forbidden');
        },
    });

    /** @type {WeakMap<WebSocket, boolean>} */
    const alive = new WeakMap();
    /** @type {import('./eventHub.js').DashboardEvent[]} */
    let queue = [];
    let dropped = 0;

    wss.on('connection', (ws) => {
        alive.set(ws, true);
        ws.on('pong', () => alive.set(ws, true));
        ws.on('error', (err) => logger.warn({ err }, 'websocket client error'));
        // The protocol is server -> client only; ignore anything clients send.
        ws.on('message', () => {});
        ws.send(
            JSON.stringify({
                type: 'SYSTEM',
                source: 'server',
                isSimulated: false,
                timestamp: Date.now(),
                message: 'Connected to Real-Time Dashboard Server',
                ...getHello(),
            }),
        );
    });

    const unsubscribe = hub.subscribe((event) => {
        if (wss.clients.size > 0) queue.push(event);
    });

    const flushTimer = setInterval(() => {
        if (queue.length === 0) return;
        const payload = JSON.stringify({ type: 'BATCH', events: queue });
        queue = [];
        for (const client of wss.clients) {
            if (client.readyState !== WebSocket.OPEN) continue;
            if (client.bufferedAmount > MAX_BUFFERED_BYTES) {
                dropped += 1;
                continue;
            }
            client.send(payload);
        }
    }, batchMs);
    flushTimer.unref();

    const heartbeatTimer = setInterval(() => {
        for (const client of wss.clients) {
            if (!alive.get(client)) {
                client.terminate();
                continue;
            }
            alive.set(client, false);
            client.ping();
        }
    }, heartbeatMs);
    heartbeatTimer.unref();

    return {
        get clientCount() {
            return wss.clients.size;
        },
        get droppedBatches() {
            return dropped;
        },
        /** Closes every connection with 1001 (going away) and stops timers. */
        async close() {
            unsubscribe();
            clearInterval(flushTimer);
            clearInterval(heartbeatTimer);
            for (const client of wss.clients) client.close(1001, 'Server shutting down');
            await new Promise((resolve) => wss.close(() => resolve(undefined)));
        },
    };
}
