import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startTestServer, waitForMessage } from './helpers.js';

/** @param {string} url @param {Record<string, string>} [headers] */
function open(url, headers) {
    const ws = new WebSocket(url, { headers });
    return ws;
}

describe('WebSocket streaming', () => {
    /** @type {Awaited<ReturnType<typeof startTestServer>>[]} */
    const servers = [];
    after(async () => {
        await Promise.all(servers.map((s) => s.runtime.stop()));
    });

    it('greets with source status and streams batched simulated telemetry', async () => {
        const ctx = await startTestServer({ IOT_SOURCE: 'simulated', IOT_INTERVAL_MS: '50' });
        servers.push(ctx);
        const ws = open(ctx.wsUrl);
        const hello = await waitForMessage(ws, (m) => m.type === 'SYSTEM');
        assert.equal(hello.sources.iot.source, 'simulated');
        assert.deepEqual(hello.snapshot, []);

        const batch = await waitForMessage(ws, (m) => m.type === 'BATCH');
        const iot = batch.events.find((/** @type {any} */ e) => e.type === 'IOT');
        assert.ok(iot, 'batch contains IOT event');
        assert.equal(iot.isSimulated, true);
        assert.equal(iot.source, 'simulator');
        ws.close();
    });

    it('publishes real CoinGecko prices once and only when they change', async () => {
        let calls = 0;
        const client = {
            async fetchPrices() {
                calls += 1;
                return { bitcoin: { usd: 64000, last_updated_at: 100 } };
            },
        };
        const ctx = await startTestServer({ CRYPTO_SOURCE: 'coingecko', CRYPTO_POLL_MS: '60000' }, client);
        servers.push(ctx);
        // start() already ran one tick; wait for it to land.
        await new Promise((r) => setTimeout(r, 20));
        const ws = open(ctx.wsUrl);
        const hello = await waitForMessage(ws, (m) => m.type === 'SYSTEM');
        assert.equal(hello.snapshot.length, 1, 'new clients get the latest real price immediately');
        assert.equal(hello.snapshot[0].isSimulated, false);
        assert.equal(hello.snapshot[0].data.bitcoin.usd, 64000);
        ws.close();

        // A second poll with identical CoinGecko data must not create a duplicate event.
        await ctx.runtime.cryptoFeed.tick();
        assert.equal(calls, 2);
        const body = await (await fetch(`${ctx.base}/api/history?limit=50`)).json();
        assert.equal(body.data.filter((/** @type {any} */ e) => e.type === 'CRYPTO').length, 1);
    });

    it('never publishes placeholder prices when CoinGecko fails', async () => {
        const client = {
            async fetchPrices() {
                throw new Error('CoinGecko responded with HTTP 429');
            },
        };
        const ctx = await startTestServer({ CRYPTO_SOURCE: 'coingecko' }, client);
        servers.push(ctx);
        await new Promise((r) => setTimeout(r, 20));

        const events = (await (await fetch(`${ctx.base}/api/history?limit=50`)).json()).data;
        assert.equal(events.filter((/** @type {any} */ e) => e.type === 'CRYPTO').length, 0);
        const error = events.find((/** @type {any} */ e) => e.type === 'SYSTEM_ERROR');
        assert.match(error.message, /HTTP 429/);

        const status = (await (await fetch(`${ctx.base}/api/status`)).json()).data.crypto;
        assert.equal(status.state, 'degraded');
        assert.ok(status.nextRetryAt > Date.now());
    });

    it('labels demo crypto prices as simulated', async () => {
        const ctx = await startTestServer({ CRYPTO_SOURCE: 'demo', CRYPTO_POLL_MS: '1000' });
        servers.push(ctx);
        await new Promise((r) => setTimeout(r, 20));
        const events = (await (await fetch(`${ctx.base}/api/history?limit=10`)).json()).data;
        const crypto = events.find((/** @type {any} */ e) => e.type === 'CRYPTO');
        assert.equal(crypto.isSimulated, true);
        assert.equal(crypto.source, 'simulator');
    });

    it('rejects upgrades from foreign origins but accepts same-host and allow-listed ones', async () => {
        const ctx = await startTestServer({ ALLOWED_ORIGINS: 'https://dash.example' });
        servers.push(ctx);
        const host = new URL(ctx.base).host;

        const foreign = open(ctx.wsUrl, { Origin: 'https://evil.example' });
        const status = await new Promise((resolve) => {
            foreign.on('unexpected-response', (_req, res) => resolve(res.statusCode));
            foreign.on('open', () => resolve(101));
            foreign.on('error', () => {});
        });
        assert.equal(status, 403);

        for (const origin of [`http://${host}`, 'https://dash.example']) {
            const ws = open(ctx.wsUrl, { Origin: origin });
            await waitForMessage(ws, (m) => m.type === 'SYSTEM');
            ws.close();
        }
    });
});
