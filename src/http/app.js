import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { createApiRouter } from './routes.js';
import { createErrorHandler, notFoundHandler } from './errorHandler.js';

/**
 * Builds the Express application. Pure wiring: no timers, no listening socket.
 *
 * @param {object} deps
 * @param {import('../config.js').AppConfig} deps.config
 * @param {import('../logger.js').Logger} deps.logger
 * @param {import('../services/eventHub.js').EventHub} deps.hub
 * @param {import('../infra/eventStore.js').EventStore} deps.store
 * @param {() => Record<string, unknown>} deps.getStatus
 * @param {() => boolean} deps.isReady
 */
export function createApp({ config, logger, hub, store, getStatus, isReady }) {
    const app = express();
    const publicDir = path.join(config.rootDir, 'public');
    const modulesDir = path.join(config.rootDir, 'node_modules');

    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy);

    app.use((req, res, next) => {
        const started = process.hrtime.bigint();
        const requestId = randomUUID();
        res.setHeader('X-Request-Id', requestId);
        res.on('finish', () => {
            if (req.path === '/healthz' || req.path === '/readyz') return;
            logger.info(
                {
                    requestId,
                    method: req.method,
                    url: req.originalUrl,
                    status: res.statusCode,
                    durationMs: Number(process.hrtime.bigint() - started) / 1e6,
                },
                'request completed',
            );
        });
        next();
    });

    app.use(
        helmet({
            contentSecurityPolicy: {
                useDefaults: true,
                directives: {
                    'default-src': ["'self'"],
                    'script-src': ["'self'"],
                    'style-src': ["'self'"],
                    'img-src': ["'self'", 'data:'],
                    'font-src': ["'self'"],
                    'connect-src': ["'self'"],
                    'worker-src': ["'self'"],
                    'object-src': ["'none'"],
                    'frame-ancestors': ["'none'"],
                    'upgrade-insecure-requests': config.nodeEnv === 'production' ? [] : null,
                },
            },
            strictTransportSecurity: config.nodeEnv === 'production',
        }),
    );
    app.use(compression());

    // Liveness: the process is up and the event loop answers.
    app.get('/healthz', (_req, res) => {
        res.set('Cache-Control', 'no-store').json({ status: 'ok' });
    });
    // Readiness: dependencies needed to serve traffic are available.
    app.get('/readyz', (_req, res) => {
        const db = store.ping();
        const ready = isReady() && db;
        res.set('Cache-Control', 'no-store')
            .status(ready ? 200 : 503)
            .json({ status: ready ? 'ready' : 'not_ready', checks: { database: db ? 'ok' : 'fail' } });
    });

    const api = express.Router();
    api.use((req, res, next) => {
        const origin = req.headers.origin;
        if (config.allowedOrigins.length === 0) {
            // Read-only public data, no credentials: any origin may read it.
            res.setHeader('Access-Control-Allow-Origin', '*');
        } else if (origin && config.allowedOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }
        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.status(204).end();
            return;
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.setHeader('Allow', 'GET, HEAD, OPTIONS');
            res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
            return;
        }
        next();
    });
    api.use(
        rateLimit({
            windowMs: 60_000,
            limit: config.rateLimitPerMinute,
            standardHeaders: 'draft-8',
            legacyHeaders: false,
            message: { status: 'error', message: 'Too many requests, please slow down.' },
        }),
    );
    api.use(createApiRouter({ config, hub, store, getStatus }));
    app.use('/api', api);

    // API docs (Swagger UI served locally so the strict CSP applies).
    app.get('/api-docs', (_req, res) => res.sendFile(path.join(publicDir, 'docs', 'index.html')));
    app.use(
        '/vendor/swagger-ui',
        express.static(path.join(modulesDir, 'swagger-ui-dist'), { index: false, maxAge: '7d' }),
    );
    app.get('/vendor/chart.umd.min.js', (_req, res) =>
        res.sendFile(path.join(modulesDir, 'chart.js', 'dist', 'chart.umd.min.js'), { maxAge: '7d' }),
    );

    app.use(
        express.static(publicDir, {
            index: 'index.html',
            setHeaders(res, filePath) {
                if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
            },
        }),
    );

    app.use(notFoundHandler);
    app.use(createErrorHandler(logger));
    return app;
}
