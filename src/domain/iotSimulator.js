/**
 * Demo telemetry generator. There is no physical sensor behind the dashboard: every
 * value produced here is synthetic and is published with `isSimulated: true`.
 *
 * Values follow a bounded random walk (more realistic than independent uniform noise,
 * and it gives the client-side z-score detector something meaningful to work with),
 * with an occasional injected spike so the anomaly path can be demonstrated.
 *
 * @param {object} [options]
 * @param {() => number} [options.rng] uniform random in [0, 1)
 * @param {number} [options.spikeProbability] chance of a temperature spike per sample
 */
export function createIotSimulator({ rng = Math.random, spikeProbability = 0.002 } = {}) {
    const state = { temperature: 26, humidity: 55, cpuUsage: 35 };

    /**
     * @param {number} value
     * @param {number} step
     * @param {number} min
     * @param {number} max
     */
    const walk = (value, step, min, max) => Math.min(max, Math.max(min, value + (rng() - 0.5) * step));
    const round = (/** @type {number} */ v) => Math.round(v * 100) / 100;

    return {
        /** @returns {{ temperature: number, humidity: number, cpuUsage: number }} */
        next() {
            state.temperature = walk(state.temperature, 0.6, 18, 35);
            state.humidity = walk(state.humidity, 1.5, 30, 85);
            state.cpuUsage = walk(state.cpuUsage, 8, 2, 98);
            const spike = rng() < spikeProbability ? 8 + rng() * 4 : 0;
            return {
                temperature: round(Math.min(45, state.temperature + spike)),
                humidity: round(state.humidity),
                cpuUsage: round(state.cpuUsage),
            };
        },
    };
}
