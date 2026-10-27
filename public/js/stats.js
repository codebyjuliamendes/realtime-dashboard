// Pure statistics helpers shared by the Web Worker and the unit tests.

/**
 * Simple moving average of the last `windowSize` values.
 * @param {number[]} values
 * @param {number} windowSize
 * @returns {number | null} null when there is no data
 */
export function movingAverage(values, windowSize) {
    if (values.length === 0) return null;
    const slice = values.slice(-windowSize);
    return slice.reduce((acc, v) => acc + v, 0) / slice.length;
}

/**
 * Absolute z-score of the latest value against the preceding samples (the latest value
 * is excluded from the baseline so a spike cannot mask itself).
 * @param {number[]} values
 * @returns {number} 0 when there is not enough data or no variance
 */
export function latestZScore(values) {
    if (values.length < 11) return 0;
    const latest = values[values.length - 1];
    const baseline = values.slice(0, -1);
    const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    const variance = baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length;
    const stdDev = Math.sqrt(variance);
    return stdDev === 0 ? 0 : Math.abs((latest - mean) / stdDev);
}

/**
 * Detects an anomaly on the latest telemetry sample.
 * @param {{ temperature: number, cpuUsage: number }[]} samples oldest first
 * @param {number} [threshold]
 * @returns {string | null} human readable anomaly, or null
 */
export function detectAnomaly(samples, threshold = 3) {
    const temps = samples.map((s) => s.temperature);
    if (latestZScore(temps) > threshold) return 'Temperature spike';
    const cpus = samples.map((s) => s.cpuUsage);
    if (latestZScore(cpus) > threshold) return 'CPU spike';
    return null;
}
