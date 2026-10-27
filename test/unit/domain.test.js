import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker } from '../../src/domain/circuitBreaker.js';
import { RingBuffer } from '../../src/domain/ringBuffer.js';
import { createDemoPriceWalk, parseCoinGeckoPrices, quotesFingerprint } from '../../src/domain/crypto.js';
import { createIotSimulator } from '../../src/domain/iotSimulator.js';
import { parseHistoryQuery } from '../../src/domain/historyQuery.js';
import { HttpError } from '../../src/domain/errors.js';

/** Deterministic PRNG (mulberry32) for reproducible tests. */
function seeded(seed = 42) {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe('CircuitBreaker', () => {
    it('opens after a failure and backs off exponentially up to the cap', () => {
        let now = 0;
        const cb = new CircuitBreaker({ backoffBaseMs: 100, maxBackoffMs: 350, now: () => now });
        assert.equal(cb.state, 'closed');
        assert.equal(cb.recordFailure(), 100);
        assert.equal(cb.canRequest(), false);
        now = 100;
        assert.equal(cb.state, 'half-open');
        assert.equal(cb.canRequest(), true);
        assert.equal(cb.recordFailure(), 200);
        assert.equal(cb.recordFailure(), 350);
        cb.recordSuccess();
        assert.equal(cb.state, 'closed');
        assert.equal(cb.recordFailure(), 100);
    });
});

describe('RingBuffer', () => {
    it('keeps the most recent items in insertion order', () => {
        const rb = new RingBuffer(3);
        [1, 2, 3, 4, 5].forEach((n) => rb.push(n));
        assert.deepEqual(rb.last(), [3, 4, 5]);
        assert.deepEqual(rb.last(2), [4, 5]);
        assert.deepEqual(rb.last(0), []);
        assert.deepEqual(rb.last(99), [3, 4, 5]);
    });

    it('rejects invalid capacity', () => {
        assert.throws(() => new RingBuffer(0), RangeError);
    });
});

describe('parseCoinGeckoPrices', () => {
    it('normalises a valid response', () => {
        const quotes = parseCoinGeckoPrices({
            bitcoin: { usd: 64000.5, last_updated_at: 1_700_000_000 },
            ethereum: { usd: 3100 },
            solana: { usd: 150, last_updated_at: 1_700_000_001 },
        });
        assert.deepEqual(quotes.bitcoin, { usd: 64000.5, last_updated_at: 1_700_000_000 });
        assert.deepEqual(quotes.ethereum, { usd: 3100, last_updated_at: null });
    });

    it('drops invalid coins instead of inventing values', () => {
        const quotes = parseCoinGeckoPrices({ bitcoin: { usd: 1 }, ethereum: { usd: 'NaN' }, solana: { usd: -1 } });
        assert.deepEqual(Object.keys(quotes), ['bitcoin']);
    });

    it('throws when nothing usable is present', () => {
        assert.throws(() => parseCoinGeckoPrices({ status: { error_code: 429 } }), /no valid prices/);
        assert.throws(() => parseCoinGeckoPrices(null), /not an object/);
    });

    it('fingerprint changes only when data changes', () => {
        const a = parseCoinGeckoPrices({ bitcoin: { usd: 1, last_updated_at: 10 } });
        const b = parseCoinGeckoPrices({ bitcoin: { usd: 1, last_updated_at: 10 } });
        const c = parseCoinGeckoPrices({ bitcoin: { usd: 1, last_updated_at: 11 } });
        assert.equal(quotesFingerprint(a), quotesFingerprint(b));
        assert.notEqual(quotesFingerprint(a), quotesFingerprint(c));
    });
});

describe('createDemoPriceWalk', () => {
    it('stays within bounds around synthetic base values', () => {
        const walk = createDemoPriceWalk(seeded());
        for (let i = 0; i < 2000; i++) {
            const q = walk.next(1_700_000_000_000);
            assert.ok(q.bitcoin.usd >= 50 && q.bitcoin.usd <= 150);
            assert.ok(q.solana.usd >= 5 && q.solana.usd <= 15);
            assert.equal(q.bitcoin.last_updated_at, 1_700_000_000);
        }
    });
});

describe('createIotSimulator', () => {
    it('produces bounded, finite values', () => {
        const sim = createIotSimulator({ rng: seeded(7), spikeProbability: 0.05 });
        for (let i = 0; i < 5000; i++) {
            const s = sim.next();
            assert.ok(s.temperature >= 18 && s.temperature <= 45, `temperature ${s.temperature}`);
            assert.ok(s.humidity >= 30 && s.humidity <= 85);
            assert.ok(s.cpuUsage >= 2 && s.cpuUsage <= 98);
        }
    });
});

describe('parseHistoryQuery', () => {
    const limits = { maxLimit: 5000, defaultLimit: 100, maxRangeMs: 3_600_000 };

    it('defaults to recent mode', () => {
        assert.deepEqual(parseHistoryQuery({}, limits), { mode: 'recent', limit: 100 });
        assert.deepEqual(parseHistoryQuery({ limit: '25' }, limits), { mode: 'recent', limit: 25 });
    });

    it('parses a range', () => {
        assert.deepEqual(parseHistoryQuery({ start: '1000', end: '2000' }, limits), {
            mode: 'range',
            start: 1000,
            end: 2000,
            limit: 100,
        });
    });

    for (const [name, query] of [
        ['non-numeric', { limit: 'abc' }],
        ['float', { limit: '1.5' }],
        ['zero limit', { limit: '0' }],
        ['negative limit', { limit: '-5' }],
        ['limit above max', { limit: '5001' }],
        ['start without end', { start: '1' }],
        ['start after end', { start: '5', end: '1' }],
        ['range too wide', { start: '0', end: String(3_600_001) }],
        ['array param', { limit: ['1', '2'] }],
        ['negative timestamps', { start: '-10', end: '-1' }],
    ]) {
        it(`rejects ${name}`, () => {
            assert.throws(
                () => parseHistoryQuery(/** @type {any} */ (query), limits),
                (err) => err instanceof HttpError && err.status === 400,
            );
        });
    }
});
