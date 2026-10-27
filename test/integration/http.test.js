import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

describe('HTTP API', () => {
    /** @type {Awaited<ReturnType<typeof startTestServer>>} */
    let ctx;

    before(async () => {
        ctx = await startTestServer({ RATE_LIMIT_PER_MINUTE: '1000' });
        const { hub } = ctx.runtime;
        hub.publish({
            type: 'IOT',
            source: 'simulator',
            isSimulated: true,
            timestamp: 1_000,
            data: { temperature: 1 },
        });
        hub.publish({
            type: 'IOT',
            source: 'simulator',
            isSimulated: true,
            timestamp: 2_000,
            data: { temperature: 2 },
        });
        hub.publish({
            type: 'IOT',
            source: 'simulator',
            isSimulated: true,
            timestamp: 3_000,
            data: { temperature: 3 },
        });
    });
    after(() => ctx.runtime.stop());

    it('serves liveness and readiness probes', async () => {
        const live = await fetch(`${ctx.base}/healthz`);
        assert.equal(live.status, 200);
        const ready = await fetch(`${ctx.base}/readyz`);
        assert.equal(ready.status, 200);
        assert.deepEqual(await ready.json(), { status: 'ready', checks: { database: 'ok' } });
    });

    it('returns recent events from memory', async () => {
        const res = await fetch(`${ctx.base}/api/history?limit=2`);
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.count, 2);
        assert.deepEqual(
            body.data.map((/** @type {any} */ e) => e.timestamp),
            [2_000, 3_000],
        );
        assert.equal(res.headers.get('access-control-allow-origin'), '*');
    });

    it('returns a persisted range from SQLite', async () => {
        const res = await fetch(`${ctx.base}/api/history?start=1500&end=3000`);
        const body = await res.json();
        assert.deepEqual(
            body.data.map((/** @type {any} */ e) => e.data.temperature),
            [2, 3],
        );
        assert.equal(body.data[0].isSimulated, true);
    });

    it('rejects invalid query parameters with 400', async () => {
        for (const qs of ['limit=abc', 'limit=0', 'start=1', 'start=10&end=1', 'start=0&end=99999999999']) {
            const res = await fetch(`${ctx.base}/api/history?${qs}`);
            assert.equal(res.status, 400, qs);
            const body = await res.json();
            assert.equal(body.status, 'error');
            assert.ok(body.message);
        }
    });

    it('exposes feed status', async () => {
        const body = await (await fetch(`${ctx.base}/api/status`)).json();
        assert.equal(body.data.crypto.source, 'off');
        assert.equal(body.data.iot.source, 'off');
    });

    it('answers unknown routes and non-GET methods with JSON errors', async () => {
        const notFound = await fetch(`${ctx.base}/api/nope`);
        assert.equal(notFound.status, 404);
        assert.equal((await notFound.json()).status, 'error');
        const post = await fetch(`${ctx.base}/api/history`, { method: 'POST' });
        assert.equal(post.status, 405);
    });

    it('serves the dashboard with a strict CSP and security headers', async () => {
        const res = await fetch(`${ctx.base}/`);
        assert.equal(res.status, 200);
        const csp = res.headers.get('content-security-policy') ?? '';
        assert.match(csp, /script-src 'self'/);
        assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(res.headers.get('x-powered-by'), null);
        const html = await res.text();
        assert.doesNotMatch(html, /<script>(?!<\/script>)/, 'no inline scripts');
        assert.doesNotMatch(html, /cdn\.|unpkg\.com/, 'no third-party scripts');
    });

    it('serves self-hosted vendor assets and the API docs', async () => {
        assert.equal((await fetch(`${ctx.base}/vendor/chart.umd.min.js`)).status, 200);
        assert.equal((await fetch(`${ctx.base}/vendor/swagger-ui/swagger-ui-bundle.js`)).status, 200);
        assert.equal((await fetch(`${ctx.base}/api-docs`)).status, 200);
        const spec = await (await fetch(`${ctx.base}/swagger.json`)).json();
        assert.equal(spec.openapi, '3.0.3');
    });
});

describe('rate limiting', () => {
    it('limits /api requests per client', async () => {
        const ctx = await startTestServer({ RATE_LIMIT_PER_MINUTE: '3' });
        try {
            const statuses = [];
            for (let i = 0; i < 5; i++) statuses.push((await fetch(`${ctx.base}/api/status`)).status);
            assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
            // probes are not rate limited
            assert.equal((await fetch(`${ctx.base}/healthz`)).status, 200);
        } finally {
            await ctx.runtime.stop();
        }
    });
});

describe('shutdown', () => {
    it('reports not ready once stopping and closes cleanly', async () => {
        const ctx = await startTestServer();
        await ctx.runtime.stop();
        await assert.rejects(fetch(`${ctx.base}/healthz`));
        assert.equal(ctx.runtime.store.ping(), false);
    });
});
