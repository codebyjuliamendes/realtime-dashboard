import pino from 'pino';
import { loadConfig } from '../../src/config.js';
import { createRuntime } from '../../src/runtime.js';

/**
 * Starts a full runtime on an ephemeral port with an in-memory database and no
 * network access (the crypto client is a stub).
 *
 * @param {Record<string, string>} [env]
 * @param {{ fetchPrices(): Promise<any> }} [cryptoClient]
 */
export async function startTestServer(env = {}, cryptoClient) {
    const config = loadConfig({
        NODE_ENV: 'test',
        PORT: '0',
        HOST: '127.0.0.1',
        DB_FILE: ':memory:',
        IOT_SOURCE: 'off',
        CRYPTO_SOURCE: 'off',
        WS_BATCH_MS: '10',
        ...env,
    });
    const runtime = createRuntime({ config, logger: pino({ level: 'silent' }), cryptoClient });
    const address = await runtime.start();
    const base = `http://127.0.0.1:${address.port}`;
    return { runtime, base, wsUrl: `ws://127.0.0.1:${address.port}`, config };
}

/**
 * Collects WebSocket messages until `predicate` matches one.
 * @param {import('ws').WebSocket} ws
 * @param {(msg: any) => boolean} predicate
 */
export function waitForMessage(ws, predicate, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out waiting for message')), timeoutMs);
        const onMessage = (/** @type {Buffer} */ raw) => {
            const msg = JSON.parse(raw.toString());
            if (predicate(msg)) {
                clearTimeout(timer);
                ws.off('message', onMessage);
                resolve(msg);
            }
        };
        ws.on('message', onMessage);
    });
}
