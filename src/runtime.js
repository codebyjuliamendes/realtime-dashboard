import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createApp } from './http/app.js';
import { createEventStore } from './infra/eventStore.js';
import { createCoinGeckoClient } from './infra/coingeckoClient.js';
import { createEventHub } from './services/eventHub.js';
import { createCryptoFeed } from './services/cryptoFeed.js';
import { createIotFeed } from './services/iotFeed.js';
import { createWebSocketGateway } from './services/websocketGateway.js';

/**
 * Composition root: wires store, feeds, HTTP and WebSocket together and owns the
 * lifecycle (start / graceful stop). Used by server.js and by integration tests.
 *
 * @param {object} options
 * @param {import('./config.js').AppConfig} options.config
 * @param {import('./logger.js').Logger} options.logger
 * @param {{ fetchPrices(): Promise<import('./domain/crypto.js').CryptoQuotes> }} [options.cryptoClient]
 */
export function createRuntime({ config, logger, cryptoClient }) {
    const store = createEventStore({ filePath: config.dbFile, logger });
    const hub = createEventHub({ store, bufferSize: config.historyBufferSize });

    const cryptoFeed = createCryptoFeed({
        source: config.cryptoSource,
        intervalMs: config.cryptoPollMs,
        hub,
        logger,
        client:
            cryptoClient ??
            (config.cryptoSource === 'coingecko'
                ? createCoinGeckoClient({
                      baseUrl: config.coingeckoBaseUrl,
                      apiKey: config.coingeckoApiKey,
                      timeoutMs: config.upstreamTimeoutMs,
                  })
                : undefined),
    });
    const iotFeed = createIotFeed({ source: config.iotSource, intervalMs: config.iotIntervalMs, hub });

    let ready = false;
    let shuttingDown = false;
    /** @type {NodeJS.Timeout | null} */
    let retentionTimer = null;

    const getStatus = () => ({
        crypto: cryptoFeed.getStatus(),
        iot: iotFeed.getStatus(),
        retentionHours: config.retentionHours,
    });

    const app = createApp({ config, logger, hub, store, getStatus, isReady: () => ready && !shuttingDown });
    const server = http.createServer(app);
    server.keepAliveTimeout = 65_000;
    server.headersTimeout = 66_000;

    const gateway = createWebSocketGateway({
        server,
        hub,
        logger,
        batchMs: config.wsBatchMs,
        heartbeatMs: config.wsHeartbeatMs,
        allowedOrigins: config.allowedOrigins,
        getHello: () => {
            const lastCrypto = hub.getLatest('CRYPTO');
            return { sources: getStatus(), snapshot: lastCrypto ? [lastCrypto] : [] };
        },
    });

    const prune = () => {
        try {
            const removed = store.prune(Date.now() - config.retentionHours * 3_600_000);
            if (removed > 0) logger.info({ removed }, 'pruned expired events');
        } catch (err) {
            logger.error({ err }, 'event retention prune failed');
        }
    };

    return {
        server,
        hub,
        store,
        cryptoFeed,

        /** @returns {Promise<import('node:net').AddressInfo>} */
        async start() {
            if (!fs.existsSync(path.join(config.rootDir, 'public', 'css', 'app.css'))) {
                logger.warn('public/css/app.css not found: run "npm run build" to generate the stylesheet');
            }
            prune();
            retentionTimer = setInterval(prune, 10 * 60_000);
            retentionTimer.unref();

            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(config.port, config.host, () => {
                    server.off('error', reject);
                    resolve(undefined);
                });
            });
            cryptoFeed.start();
            iotFeed.start();
            ready = true;
            const address = /** @type {import('node:net').AddressInfo} */ (server.address());
            logger.info(
                { port: address.port, host: config.host, crypto: config.cryptoSource, iot: config.iotSource },
                'server listening',
            );
            return address;
        },

        /** Graceful shutdown: stop feeds, close WebSockets, drain HTTP, close DB. */
        async stop() {
            if (shuttingDown) return;
            shuttingDown = true;
            ready = false;
            cryptoFeed.stop();
            iotFeed.stop();
            if (retentionTimer) clearInterval(retentionTimer);

            const force = setTimeout(() => {
                logger.warn('shutdown timeout reached, closing remaining connections');
                server.closeAllConnections();
            }, config.shutdownTimeoutMs);
            force.unref();

            await gateway.close();
            // Keep-alive sockets that finish their in-flight response become idle later;
            // sweep them so close() does not wait for the keep-alive timeout.
            const sweep = setInterval(() => server.closeIdleConnections(), 100);
            await new Promise((resolve) => {
                server.close(() => resolve(undefined));
                server.closeIdleConnections();
            });
            clearInterval(sweep);
            clearTimeout(force);
            store.close();
            logger.info('shutdown complete');
        },
    };
}
