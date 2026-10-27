import { createIotSimulator } from '../domain/iotSimulator.js';

/**
 * Publishes demo telemetry (IOT events). The project has no real sensor integration,
 * so the only available source is the simulator; every event is flagged as simulated.
 *
 * @param {object} options
 * @param {'simulated' | 'off'} options.source
 * @param {number} options.intervalMs
 * @param {import('./eventHub.js').EventHub} options.hub
 * @param {() => number} [options.rng]
 */
export function createIotFeed({ source, intervalMs, hub, rng }) {
    const simulator = createIotSimulator({ rng });
    /** @type {NodeJS.Timeout | null} */
    let timer = null;

    const tick = () => hub.publish({ type: 'IOT', source: 'simulator', isSimulated: true, data: simulator.next() });

    return {
        start() {
            if (source === 'off' || timer) return;
            timer = setInterval(tick, intervalMs);
            timer.unref?.();
        },
        stop() {
            if (timer) clearInterval(timer);
            timer = null;
        },
        tick,
        getStatus() {
            return { source, state: source === 'off' ? 'off' : 'ok', isSimulated: source !== 'off' };
        },
    };
}
