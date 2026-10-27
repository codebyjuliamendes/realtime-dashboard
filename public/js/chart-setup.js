import { formatPrice, percentChange } from './format.js';

// Chart.js (UMD build, self-hosted at /vendor/chart.umd.min.js) defaults for the dark theme.
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
Chart.defaults.borderColor = 'rgba(148, 163, 184, 0.12)';
Chart.defaults.elements.line.borderWidth = 2;
Chart.defaults.elements.line.tension = 0.3;
Chart.defaults.elements.point.radius = 0;
Chart.defaults.animation = false;

export const COINS = [
    { id: 'bitcoin', label: 'BTC', color: '#fbbf24' },
    { id: 'ethereum', label: 'ETH', color: '#38bdf8' },
    { id: 'solana', label: 'SOL', color: '#34d399' },
];

/**
 * Crypto chart in % change since the first point of the visible window, so coins with
 * very different prices share one readable axis. Tooltips show the actual price.
 * @param {HTMLCanvasElement} canvas
 */
export function createCryptoChart(canvas, maxPoints = 60) {
    /** @type {{ label: string, prices: (number | null)[], simulated: boolean }[]} */
    let points = [];
    const chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: [],
            datasets: COINS.map((c) => ({ label: c.label, borderColor: c.color, backgroundColor: c.color, data: [] })),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { ticks: { maxTicksLimit: 6, maxRotation: 0, autoSkipPadding: 24 } },
                y: {
                    position: 'right',
                    title: { display: true, text: '% change in window' },
                    ticks: { callback: (v) => `${Number(v).toFixed(2)}%` },
                },
            },
            plugins: {
                legend: { position: 'top', align: 'end', labels: { boxWidth: 12 } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const p = points[ctx.dataIndex];
                            const price = p?.prices[ctx.datasetIndex];
                            const pct = typeof ctx.parsed.y === 'number' ? `${ctx.parsed.y.toFixed(2)}%` : '—';
                            return `${ctx.dataset.label}: ${formatPrice(price, { simulated: p?.simulated })} (${pct})`;
                        },
                    },
                },
            },
        },
    });

    function redraw() {
        const base = COINS.map((_, i) => points.find((p) => p.prices[i] != null)?.prices[i] ?? null);
        chart.data.labels = points.map((p) => p.label);
        chart.data.datasets.forEach((ds, i) => {
            ds.data = points.map((p) => {
                const price = p.prices[i];
                return price == null || base[i] == null ? null : percentChange(price, base[i]);
            });
        });
        chart.update('none');
    }

    return {
        /** @param {string} label @param {(number | null)[]} prices @param {boolean} simulated */
        push(label, prices, simulated) {
            points.push({ label, prices, simulated });
            if (points.length > maxPoints) points = points.slice(-maxPoints);
            redraw();
        },
        reset() {
            points = [];
            redraw();
        },
        get size() {
            return points.length;
        },
    };
}

/** @param {HTMLCanvasElement} canvas */
export function createIotChart(canvas, maxPoints = 120) {
    const chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Temp (°C)', borderColor: '#fb7185', backgroundColor: '#fb7185', data: [] },
                { label: 'Humidity (%)', borderColor: '#38bdf8', backgroundColor: '#38bdf8', data: [] },
                { label: 'CPU (%)', borderColor: '#34d399', backgroundColor: '#34d399', data: [] },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: { x: { display: false }, y: { min: 0, max: 100 } },
            plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 12 } } },
        },
    });
    let dirty = false;

    return {
        /** @param {string} label @param {number[]} values */
        push(label, values) {
            chart.data.labels.push(label);
            chart.data.datasets.forEach((ds, i) => ds.data.push(values[i]));
            if (chart.data.labels.length > maxPoints) {
                chart.data.labels.shift();
                chart.data.datasets.forEach((ds) => ds.data.shift());
            }
            dirty = true;
        },
        /** Called from the animation-frame loop; redraws at most once per frame. */
        flush() {
            if (!dirty) return;
            dirty = false;
            chart.update('none');
        },
        reset() {
            chart.data.labels = [];
            chart.data.datasets.forEach((ds) => (ds.data = []));
            dirty = true;
        },
        get size() {
            return chart.data.labels.length;
        },
    };
}
