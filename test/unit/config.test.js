import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.js';
import { ConfigError } from '../../src/domain/errors.js';

describe('loadConfig', () => {
    it('applies safe defaults', () => {
        const c = loadConfig({});
        assert.equal(c.port, 3001);
        assert.equal(c.cryptoSource, 'coingecko');
        assert.equal(c.cryptoPollMs, 30_000);
        assert.equal(c.iotSource, 'simulated');
        assert.equal(c.trustProxy, false);
        assert.deepEqual(c.allowedOrigins, []);
        assert.ok(c.dbFile.endsWith('events.db'));
    });

    it('parses overrides', () => {
        const c = loadConfig({
            PORT: '3510',
            CRYPTO_SOURCE: 'DEMO',
            IOT_SOURCE: 'off',
            DB_FILE: ':memory:',
            ALLOWED_ORIGINS: 'https://a.example, http://localhost:5173',
            TRUST_PROXY: '1',
        });
        assert.equal(c.port, 3510);
        assert.equal(c.cryptoSource, 'demo');
        assert.equal(c.iotSource, 'off');
        assert.equal(c.dbFile, ':memory:');
        assert.deepEqual(c.allowedOrigins, ['https://a.example', 'http://localhost:5173']);
        assert.equal(c.trustProxy, 1);
    });

    it('reports every invalid value at once', () => {
        assert.throws(
            () =>
                loadConfig({
                    PORT: 'abc',
                    CRYPTO_SOURCE: 'binance',
                    CRYPTO_POLL_MS: '10',
                    ALLOWED_ORIGINS: 'not a url',
                    COINGECKO_BASE_URL: 'ftp://x',
                }),
            (err) => err instanceof ConfigError && err.problems.length === 5,
        );
    });
});
