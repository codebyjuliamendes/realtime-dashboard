import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectAnomaly, latestZScore, movingAverage } from '../../public/js/stats.js';
import { cryptoState, describeEvent, formatPrice, percentChange, typeClass } from '../../public/js/format.js';

describe('stats', () => {
    it('movingAverage uses the trailing window', () => {
        assert.equal(movingAverage([], 3), null);
        assert.equal(movingAverage([1, 2, 3, 4], 2), 3.5);
    });

    it('latestZScore needs enough samples and variance', () => {
        assert.equal(latestZScore([1, 2, 3]), 0);
        assert.equal(latestZScore(new Array(20).fill(5)), 0);
    });

    it('detects a spike on the latest sample only', () => {
        const base = Array.from({ length: 50 }, (_, i) => ({
            temperature: 25 + (i % 2) * 0.2,
            cpuUsage: 40 + (i % 3),
        }));
        assert.equal(detectAnomaly(base), null);
        assert.equal(detectAnomaly([...base, { temperature: 40, cpuUsage: 41 }]), 'Temperature spike');
        assert.equal(detectAnomaly([...base, { temperature: 25.1, cpuUsage: 99 }]), 'CPU spike');
    });
});

describe('format', () => {
    it('formats prices and never invents a value', () => {
        assert.equal(formatPrice(64000.5), '$64,000.50');
        assert.equal(formatPrice(null), '—');
        assert.equal(formatPrice(NaN), '—');
        assert.equal(formatPrice(100.1, { simulated: true }), '100.10 (sim.)');
    });

    it('percentChange handles a zero base', () => {
        assert.equal(percentChange(110, 100), 10);
        assert.equal(percentChange(1, 0), null);
    });

    it('describes events as plain text', () => {
        assert.equal(describeEvent({ type: 'SYSTEM_ERROR', message: '<img src=x>' }), '<img src=x>');
        assert.equal(
            describeEvent({ type: 'CRYPTO', data: { bitcoin: { usd: 1 }, solana: { usd: 2 } } }),
            'BTC 1 · SOL 2',
        );
        assert.match(describeEvent({ type: 'IOT', data: { temperature: 1, humidity: 2, cpuUsage: 3 } }), /temp 1\.0/);
    });

    it('maps the real event types to colours', () => {
        assert.equal(typeClass('CRYPTO'), 'text-amber-300');
        assert.equal(typeClass('SYSTEM_ERROR'), 'text-red-300');
        assert.equal(typeClass('whatever'), 'text-slate-300');
    });

    it('cryptoState distinguishes live, simulated, stale, unavailable and off', () => {
        const now = 1_000_000;
        const live = { isSimulated: false, at: now - 1000 };
        assert.equal(cryptoState({ configuredSource: 'off', lastPrice: null, lastFetchFailed: false, now }), 'off');
        assert.equal(
            cryptoState({ configuredSource: 'coingecko', lastPrice: null, lastFetchFailed: false, now }),
            'waiting',
        );
        assert.equal(
            cryptoState({ configuredSource: 'coingecko', lastPrice: null, lastFetchFailed: true, now }),
            'unavailable',
        );
        assert.equal(
            cryptoState({ configuredSource: 'coingecko', lastPrice: live, lastFetchFailed: false, now }),
            'live',
        );
        assert.equal(
            cryptoState({ configuredSource: 'coingecko', lastPrice: live, lastFetchFailed: true, now }),
            'stale',
        );
        assert.equal(
            cryptoState({
                configuredSource: 'coingecko',
                lastPrice: { isSimulated: false, at: 0 },
                lastFetchFailed: false,
                now,
            }),
            'stale',
        );
        assert.equal(
            cryptoState({
                configuredSource: 'demo',
                lastPrice: { isSimulated: true, at: now },
                lastFetchFailed: false,
                now,
            }),
            'simulated',
        );
    });
});

describe('formatClockMs', () => {
    it('uses a 24-hour clock with milliseconds', async () => {
        const { formatClockMs } = await import('../../public/js/format.js');
        const d = new Date(2026, 0, 1, 22, 5, 9, 7);
        assert.equal(formatClockMs(d.getTime()), '22:05:09.007');
        assert.equal(formatClockMs(NaN), '—');
    });
});
