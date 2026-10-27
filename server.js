import { loadConfig } from './src/config.js';
import { createLogger } from './src/logger.js';
import { createRuntime } from './src/runtime.js';

let config;
try {
    config = loadConfig();
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}

const logger = createLogger(config);
const runtime = createRuntime({ config, logger });

/** @param {string} signal */
async function shutdown(signal) {
    logger.info({ signal }, 'shutdown requested');
    try {
        await runtime.stop();
        process.exit(0);
    } catch (err) {
        logger.error({ err }, 'error during shutdown');
        process.exit(1);
    }
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception, exiting');
    process.exit(1);
});

runtime.start().catch((err) => {
    logger.fatal({ err }, 'failed to start server');
    process.exit(1);
});
