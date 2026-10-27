// Module Web Worker: keeps the telemetry window and computes statistics off the main thread.
import { detectAnomaly, movingAverage } from './stats.js';

const WINDOW = 240; // ~1 minute at the default 250 ms interval
/** @type {{ temperature: number, humidity: number, cpuUsage: number }[]} */
let samples = [];
let sinceLast = 0;

self.onmessage = (e) => {
    const message = e.data;
    if (message.type === 'RESET') {
        samples = [];
        sinceLast = 0;
        return;
    }
    if (message.type !== 'PROCESS_IOT') return;

    const d = message.payload?.data;
    if (!d || ![d.temperature, d.humidity, d.cpuUsage].every((v) => typeof v === 'number' && Number.isFinite(v))) {
        return;
    }
    samples.push({ temperature: d.temperature, humidity: d.humidity, cpuUsage: d.cpuUsage });
    if (samples.length > WINDOW) samples.shift();

    // Compute every 5 samples to save cycles.
    sinceLast += 1;
    if (sinceLast < 5) return;
    sinceLast = 0;

    self.postMessage({
        type: 'IOT_STATS',
        payload: {
            avgTemp: movingAverage(
                samples.map((s) => s.temperature),
                20,
            ),
            avgHumidity: movingAverage(
                samples.map((s) => s.humidity),
                20,
            ),
            avgCpu: movingAverage(
                samples.map((s) => s.cpuUsage),
                20,
            ),
            anomaly: detectAnomaly(samples),
        },
    });
};
