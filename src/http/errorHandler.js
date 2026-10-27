import { HttpError } from '../domain/errors.js';

/** @type {import('express').RequestHandler} */
export const notFoundHandler = (req, _res, next) => {
    next(new HttpError(404, `Route ${req.method} ${req.path} not found`));
};

/**
 * Centralised error handler. Client errors (4xx) expose their message; server errors
 * are logged with the stack and answered with a generic message.
 *
 * @param {import('../logger.js').Logger} logger
 * @returns {import('express').ErrorRequestHandler}
 */
export function createErrorHandler(logger) {
    return (err, req, res, next) => {
        if (res.headersSent) return next(err);
        // body-parser and other middlewares set `status`/`expose` on their errors.
        const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
        const expose = status < 500 && (err instanceof HttpError || err?.expose === true);
        if (status >= 500) {
            logger.error({ err, method: req.method, url: req.originalUrl }, 'unhandled request error');
        }
        res.status(status).json({
            status: 'error',
            message: expose ? err.message : status === 404 ? 'Not Found' : 'Internal Server Error',
            ...(err instanceof HttpError && err.details ? { details: err.details } : {}),
        });
    };
}
