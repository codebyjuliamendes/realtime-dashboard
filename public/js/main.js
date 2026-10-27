import { VirtualScroller } from './virtual-scroll.js';
import { COINS, createCryptoChart, createIotChart } from './chart-setup.js';
import { BADGES, cryptoState, formatClock, formatMetric, formatPrice } from './format.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

const el = {
    dot: $('connection-dot'),
    status: $('status-bar'),
    notice: $('demo-notice'),
    noticeText: $('demo-notice-text'),
    cryptoBadge: $('crypto-badge'),
    cryptoMeta: $('crypto-meta'),
    cryptoEmpty: $('crypto-empty'),
    cryptoEmptyText: $('crypto-empty-text'),
    prices: [$('btc-price'), $('eth-price'), $('sol-price')],
    iotBadge: $('iot-badge'),
    iotEmpty: $('iot-empty'),
    iotEmptyText: $('iot-empty-text'),
    avgTemp: $('avg-temp'),
    avgHumidity: $('avg-humidity'),
    avgCpu: $('avg-cpu'),
    anomalyTile: $('anomaly-tile'),
    anomalyText: $('anomaly-text'),
    logEmpty: $('log-empty'),
    logCount: $('log-count'),
    slider: /** @type {HTMLInputElement} */ ($('history-slider')),
    sliderOutput: $('history-output'),
    liveBtn: /** @type {HTMLButtonElement} */ ($('history-live')),
    fps: $('fps-counter'),
    rate: $('msg-rate'),
    toasts: $('toast-container'),
};

const RECENT_LIMIT = 500;

const state = {
    /** @type {'live' | 'history'} */
    mode: 'live',
    loadingRecent: false,
    /** @type {any[]} live events received while the recent history is loading */
    pending: [],
    /** @type {{ crypto?: { source: 'coingecko' | 'demo' | 'off', lastError?: string | null, state?: string }, iot?: { source: 'simulated' | 'off' } }} */
    sources: {},
    /** @type {{ isSimulated: boolean, at: number } | null} */
    lastPrice: null,
    lastFetchFailed: false,
    lastFetchError: '',
    lastCryptoTs: 0,
    iotSeen: false,
    /** @type {AbortController | null} */
    historyAbort: null,
    /** @type {number | undefined} */
    historyDebounce: undefined,
    frames: 0,
    events: 0,
};

/** @type {WebSocket | null} */
let ws = null;
let reconnectDelay = 1000;
/** @type {number | undefined} */
let reconnectTimer;

const scroller = new VirtualScroller($('table-viewport'), $('table-scroll-content'), 40, {
    onCountChange: (count) => {
        el.logCount.textContent = count.toLocaleString('en-US');
        el.logEmpty.hidden = count > 0;
    },
});
const cryptoChart = createCryptoChart(/** @type {HTMLCanvasElement} */ ($('crypto-chart')));
const iotChart = createIotChart(/** @type {HTMLCanvasElement} */ ($('iot-chart')));
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

worker.onmessage = (e) => {
    if (e.data?.type !== 'IOT_STATS') return;
    const p = e.data.payload;
    el.avgTemp.textContent = formatMetric(p.avgTemp, '°C');
    el.avgHumidity.textContent = formatMetric(p.avgHumidity, '%');
    el.avgCpu.textContent = formatMetric(p.avgCpu, '%');
    el.anomalyText.textContent = p.anomaly ?? 'None';
    el.anomalyTile.classList.toggle('tile-alert', Boolean(p.anomaly));
};

// ---------------------------------------------------------------- rendering helpers

/** @param {HTMLElement} node @param {keyof typeof BADGES | 'history'} kind */
function setBadge(node, kind) {
    const badge =
        kind === 'history'
            ? { text: 'History', className: 'border-violet-400/40 bg-violet-400/10 text-violet-200' }
            : BADGES[kind];
    node.textContent = badge.text;
    node.className = `badge ${badge.className}`;
}

/** @param {string} text @param {'ok' | 'warn' | 'error' | 'info'} tone */
function setStatus(text, tone) {
    const tones = {
        ok: ['bg-emerald-400', 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'],
        warn: ['bg-amber-400', 'border-amber-400/30 bg-amber-400/10 text-amber-200'],
        error: ['bg-red-500', 'border-red-400/30 bg-red-400/10 text-red-200'],
        info: ['bg-violet-400', 'border-violet-400/30 bg-violet-400/10 text-violet-200'],
    };
    const [dot, pill] = tones[tone];
    el.dot.className = `h-3 w-3 rounded-full ${dot}`;
    el.status.className = `rounded-full border px-4 py-1.5 text-sm font-medium ${pill}`;
    el.status.textContent = text;
}

/** @param {string} message @param {'error' | 'info'} [kind] */
function toast(message, kind = 'error') {
    const node = document.createElement('div');
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    node.className = `glass-card rounded-lg px-4 py-3 text-sm shadow-lg ${kind === 'error' ? 'text-red-100' : 'text-slate-100'}`;
    node.textContent = message; // textContent: never interpret server text as HTML
    el.toasts.appendChild(node);
    setTimeout(() => node.remove(), 5000);
}

function renderSourceNotice() {
    const cryptoDemo = state.sources.crypto?.source === 'demo';
    const iotSim = state.sources.iot?.source !== 'off';
    if (cryptoDemo && iotSim) {
        el.noticeText.textContent =
            'crypto prices and sensor telemetry are produced by built-in simulators. They are not market or device data.';
    } else if (cryptoDemo) {
        el.noticeText.textContent = 'crypto prices are produced by a built-in simulator. They are not market data.';
    } else if (iotSim) {
        el.noticeText.textContent =
            'sensor telemetry is produced by a built-in simulator. No physical device is connected.';
    }
    el.notice.hidden = !cryptoDemo && !iotSim;
}

function renderCryptoState() {
    if (state.mode === 'history') {
        setBadge(el.cryptoBadge, 'history');
        el.cryptoMeta.textContent = state.lastPrice
            ? `Recorded ${state.lastPrice.isSimulated ? 'simulated' : 'CoinGecko'} prices · last in window ${formatClock(state.lastPrice.at)}`
            : 'Recorded prices for the selected window';
        el.cryptoEmpty.hidden = cryptoChart.size > 0;
        el.cryptoEmptyText.textContent = 'No crypto prices were recorded in this window.';
        return;
    }
    const s = cryptoState({
        configuredSource: state.sources.crypto?.source,
        lastPrice: state.lastPrice,
        lastFetchFailed: state.lastFetchFailed,
        now: Date.now(),
    });
    setBadge(el.cryptoBadge, s);
    for (const node of el.prices) node.parentElement?.classList.toggle('tile-stale', s === 'stale');

    const when = state.lastPrice ? formatClock(state.lastPrice.at) : null;
    if (s === 'simulated') {
        el.cryptoMeta.textContent = 'Source: demo price generator (synthetic values, not market prices)';
    } else if (s === 'off') {
        el.cryptoMeta.textContent = 'Crypto feed disabled on this server';
    } else if (when) {
        el.cryptoMeta.textContent = `Source: CoinGecko · price time ${when}${s === 'stale' ? ' (stale)' : ''}`;
    } else {
        el.cryptoMeta.textContent = 'Source: CoinGecko public API';
    }

    el.cryptoEmpty.hidden = cryptoChart.size > 0 && s !== 'off';
    if (s === 'off') el.cryptoEmptyText.textContent = 'The crypto feed is disabled on this server.';
    else if (s === 'unavailable')
        el.cryptoEmptyText.textContent = `CoinGecko is unavailable (${state.lastFetchError || 'no response'}). No prices are shown until real data arrives.`;
    else el.cryptoEmptyText.textContent = 'Waiting for the first price update from CoinGecko…';
    el.cryptoEmpty.querySelector('.spinner')?.toggleAttribute('hidden', s !== 'waiting');
}

function renderIotState() {
    if (state.mode === 'history') {
        setBadge(el.iotBadge, 'history');
        el.iotEmpty.hidden = iotChart.size > 0;
        el.iotEmptyText.textContent = 'No telemetry was recorded in this window.';
        return;
    }
    const off = state.sources.iot?.source === 'off';
    setBadge(el.iotBadge, off ? 'off' : state.iotSeen ? 'simulated' : 'waiting');
    el.iotEmpty.hidden = state.iotSeen && !off;
    el.iotEmptyText.textContent = off
        ? 'The telemetry simulator is disabled on this server.'
        : 'Waiting for telemetry…';
}

// ---------------------------------------------------------------- event processing

/** @param {any} ev */
function processEvent(ev) {
    if (!ev || typeof ev.type !== 'string' || typeof ev.timestamp !== 'number') return false;

    if (ev.type === 'CRYPTO') {
        if (ev.timestamp <= state.lastCryptoTs) return false; // already shown (snapshot/history overlap)
        state.lastCryptoTs = ev.timestamp;
        const prices = COINS.map((c) => (typeof ev.data?.[c.id]?.usd === 'number' ? ev.data[c.id].usd : null));
        prices.forEach((p, i) => (el.prices[i].textContent = formatPrice(p, { simulated: ev.isSimulated })));
        const sourceTimes = COINS.map((c) => ev.data?.[c.id]?.last_updated_at).filter(Number.isInteger);
        const at = sourceTimes.length ? Math.max(...sourceTimes) * 1000 : ev.timestamp;
        state.lastPrice = { isSimulated: Boolean(ev.isSimulated), at };
        state.lastFetchFailed = false;
        cryptoChart.push(formatClock(at), prices, Boolean(ev.isSimulated));
    } else if (ev.type === 'SYSTEM_ERROR' && ev.source === 'coingecko') {
        state.lastFetchFailed = true;
        state.lastFetchError = String(ev.message ?? '').replace(/^Crypto prices unavailable \((.*)\)\..*$/, '$1');
    } else if (ev.type === 'IOT') {
        const d = ev.data ?? {};
        worker.postMessage({ type: 'PROCESS_IOT', payload: ev });
        iotChart.push(formatClock(ev.timestamp), [d.temperature, d.humidity, d.cpuUsage]);
        state.iotSeen = true;
    } else if (ev.type === 'SYSTEM' && ev.sources) {
        state.sources = ev.sources;
        if (ev.sources.crypto?.state === 'degraded') {
            state.lastFetchFailed = true;
            state.lastFetchError = ev.sources.crypto.lastError ?? '';
        }
        renderSourceNotice();
    }
    return true;
}

/** @param {any[]} events oldest first */
function applyEvents(events) {
    const shown = events.filter(processEvent);
    scroller.appendMany(shown);
    renderCryptoState();
    renderIotState();
}

function resetViews() {
    scroller.clear();
    cryptoChart.reset();
    iotChart.reset();
    worker.postMessage({ type: 'RESET' });
    state.lastCryptoTs = 0;
    state.lastPrice = null;
    state.iotSeen = false;
    for (const node of [...el.prices, el.avgTemp, el.avgHumidity, el.avgCpu]) node.textContent = '—';
    el.anomalyText.textContent = 'None';
    el.anomalyTile.classList.remove('tile-alert');
}

// ---------------------------------------------------------------- data loading

/** @param {string} url @param {AbortSignal} [signal] */
async function getJson(url, signal) {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.status !== 'success') {
        throw new Error(body?.message ?? `HTTP ${res.status}`);
    }
    return body;
}

let loadGeneration = 0;

async function loadRecent() {
    const generation = ++loadGeneration;
    const current = () => generation === loadGeneration && state.mode === 'live';
    state.loadingRecent = true;
    state.pending = [];
    try {
        const [history, status] = await Promise.all([
            getJson(`/api/history?limit=${RECENT_LIMIT}`),
            getJson('/api/status').catch(() => null),
        ]);
        if (!current()) return;
        if (status) {
            state.sources = status.data;
            if (status.data.crypto?.state === 'degraded') {
                state.lastFetchFailed = true;
                state.lastFetchError = status.data.crypto.lastError ?? '';
            }
            renderSourceNotice();
        }
        applyEvents(history.data);
    } catch (err) {
        if (current()) toast(`Could not load recent events: ${err instanceof Error ? err.message : err}`);
    } finally {
        if (generation === loadGeneration) {
            state.loadingRecent = false;
            if (state.mode === 'live') {
                const lastTs = scroller.length ? scroller.itemAt(0).timestamp : 0;
                applyEvents(state.pending.filter((e) => e.timestamp > lastTs || e.type === 'SYSTEM'));
            }
            state.pending = [];
        }
    }
}

/** @param {number} minutesAgo */
async function loadHistory(minutesAgo) {
    state.historyAbort?.abort();
    const controller = new AbortController();
    state.historyAbort = controller;

    const end = Date.now() - minutesAgo * 60_000;
    const start = end - 60_000;
    el.logEmpty.textContent = 'Loading history…';
    try {
        const body = await getJson(`/api/history?start=${start}&end=${end}&limit=5000`, controller.signal);
        if (controller.signal.aborted || state.mode !== 'history') return;
        resetViews();
        applyEvents(body.data);
        el.logEmpty.textContent = 'No events were recorded in this window.';
    } catch (err) {
        if (controller.signal.aborted) return;
        el.logEmpty.textContent = 'Could not load history.';
        toast(`Could not load history: ${err instanceof Error ? err.message : err}`);
    }
}

/** @param {number} minutesAgo */
function enterHistory(minutesAgo) {
    state.mode = 'history';
    state.loadingRecent = false;
    state.pending = [];
    loadGeneration += 1;
    el.liveBtn.disabled = false;
    const end = Date.now() - minutesAgo * 60_000;
    el.sliderOutput.textContent = `${formatClock(end - 60_000)}–${formatClock(end)}`;
    setStatus(`Viewing history (${minutesAgo} min ago)`, 'info');
    clearTimeout(state.historyDebounce);
    state.historyDebounce = window.setTimeout(() => void loadHistory(minutesAgo), 250);
}

function goLive() {
    clearTimeout(state.historyDebounce);
    state.historyAbort?.abort();
    state.mode = 'live';
    el.slider.value = '0';
    el.sliderOutput.textContent = 'Live';
    el.liveBtn.disabled = true;
    el.logEmpty.textContent = 'No events yet.';
    resetViews();
    renderConnection();
    void loadRecent();
}

// ---------------------------------------------------------------- WebSocket

function renderConnection() {
    if (state.mode === 'history') return;
    if (ws?.readyState === WebSocket.OPEN) setStatus('Connected', 'ok');
    else if (ws?.readyState === WebSocket.CONNECTING) setStatus('Connecting…', 'warn');
    else setStatus(`Disconnected · retrying in ${Math.round(reconnectDelay / 1000)}s`, 'error');
}

function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);
    renderConnection();

    ws.onopen = () => {
        reconnectDelay = 1000;
        renderConnection();
    };
    ws.onclose = () => {
        renderConnection();
        clearTimeout(reconnectTimer);
        const delay = reconnectDelay * (0.8 + Math.random() * 0.4);
        reconnectTimer = window.setTimeout(connect, delay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 30_000);
    };
    ws.onmessage = (e) => {
        let msg;
        try {
            msg = JSON.parse(e.data);
        } catch {
            return;
        }
        const events = msg.type === 'BATCH' ? msg.events : [...(msg.snapshot ?? []), msg];
        if (!Array.isArray(events)) return;
        state.events += events.length;
        if (state.mode !== 'live') return;
        if (state.loadingRecent) {
            state.pending.push(...events);
            return;
        }
        applyEvents(events);
    };
}

// ---------------------------------------------------------------- controls & loops

el.slider.addEventListener('input', () => {
    const minutesAgo = -Number(el.slider.value);
    if (minutesAgo === 0) goLive();
    else enterHistory(minutesAgo);
});
el.liveBtn.addEventListener('click', goLive);
$('history-form').addEventListener('submit', (e) => e.preventDefault());

let lastTick = performance.now();
setInterval(() => {
    const now = performance.now();
    const seconds = (now - lastTick) / 1000;
    el.fps.textContent = String(Math.round(state.frames / seconds));
    el.rate.textContent = String(Math.round(state.events / seconds));
    state.frames = 0;
    state.events = 0;
    lastTick = now;
}, 1000);
// Re-evaluate staleness of the last price periodically.
setInterval(renderCryptoState, 15_000);

function frame() {
    state.frames += 1;
    iotChart.flush();
    requestAnimationFrame(frame);
}

renderCryptoState();
renderIotState();
requestAnimationFrame(frame);
void loadRecent();
connect();
