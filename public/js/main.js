import { VirtualScroller } from './virtual-scroll.js';
import { initCryptoChart, initIotChart, updateChartData } from './chart-setup.js';

// DOM Elements
const connectionIndicator = document.getElementById('connection-indicator');
const statusBar = document.getElementById('status-bar');
const fpsCounter = document.getElementById('fps-counter');
const msgRate = document.getElementById('msg-rate');

// Crypto DOM
const btcPrice = document.getElementById('btc-price');
const ethPrice = document.getElementById('eth-price');
const solPrice = document.getElementById('sol-price');

// IoT DOM
const avgTemp = document.getElementById('avg-temp');
const avgCpu = document.getElementById('avg-cpu');
const anomalyAlert = document.getElementById('anomaly-alert');

// Sub-systems
let ws;
let reconnectTimer;
let reconnectBackoff = 1000;
let scroller;
let cryptoChart, iotChart;
const worker = new Worker('js/worker.js');

// Metrics
let frames = 0;
let lastFpsTime = performance.now();
let messagesReceived = 0;
let lastMsgTime = performance.now();

// Buffers for batch rendering
let renderPending = false;
let cryptoUpdate = null;
let iotUpdate = null;

function init() {
    // Setup Virtual Scroller
    const viewport = document.getElementById('table-viewport');
    const content = document.getElementById('table-scroll-content');
    scroller = new VirtualScroller(viewport, content, 44);

    // Setup Charts
    const cryptoCtx = document.getElementById('cryptoChart').getContext('2d');
    cryptoChart = initCryptoChart(cryptoCtx);
    
    const iotCtx = document.getElementById('iotChart').getContext('2d');
    iotChart = initIotChart(iotCtx);
    
    // Setup Drag and Drop for panels
    const panels = document.querySelectorAll('.panel');
    panels.forEach(panel => {
        panel.draggable = true;
        panel.addEventListener('dragstart', handleDragStart);
        panel.addEventListener('dragover', handleDragOver);
        panel.addEventListener('drop', handleDrop);
        panel.addEventListener('dragenter', handleDragEnter);
        panel.addEventListener('dragleave', handleDragLeave);
    });
    
    // Setup Worker Listener
    worker.onmessage = (e) => {
        const { type, payload } = e.data;
        if (type === 'CRYPTO_STATS') {
            updateDOMText(btcPrice, payload.btc);
            updateDOMText(ethPrice, payload.eth);
            updateDOMText(solPrice, payload.sol);
        } else if (type === 'IOT_STATS') {
            updateDOMText(avgTemp, payload.avgTemp + ' °C');
            updateDOMText(avgCpu, payload.avgCpu + ' %');
            
            if (payload.anomaly) {
                anomalyAlert.classList.remove('warning-hidden');
                anomalyAlert.querySelector('.alert-text').textContent = payload.anomaly;
            } else {
                anomalyAlert.classList.add('warning-hidden');
            }
        }
    };

    connectWebSocket();
    requestAnimationFrame(renderLoop);
    setInterval(updateMetrics, 1000);
}

function updateDOMText(el, text) {
    if (el.textContent !== text) {
        el.textContent = text;
        // Trigger flash animation
        el.classList.remove('flash');
        void el.offsetWidth; // trigger reflow
        el.classList.add('flash');
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    statusBar.textContent = 'Connecting...';
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        connectionIndicator.classList.add('connected');
        statusBar.textContent = 'Connected';
        reconnectBackoff = 1000;
    };
    
    ws.onclose = () => {
        connectionIndicator.classList.remove('connected');
        statusBar.textContent = `Disconnected. Retrying in ${reconnectBackoff/1000}s...`;
        
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectWebSocket, reconnectBackoff);
        reconnectBackoff = Math.min(reconnectBackoff * 1.5, 30000); // Max 30s
    };
    
    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
    };
    
    ws.onmessage = (e) => {
        messagesReceived++;
        const payload = JSON.parse(e.data);
        handleMessage(payload);
    };
}

function handleMessage(message) {
    // 1. Add to virtual scroller (UI logic)
    scroller.appendData(message);
    
    // 2. Dispatch to worker for heavy lifting
    if (message.type === 'CRYPTO') {
        worker.postMessage({ type: 'PROCESS_CRYPTO', payload: message });
        
        // Queue chart update
        const d = message.data;
        cryptoUpdate = {
            label: new Date(message.timestamp).toLocaleTimeString(),
            data: [d.bitcoin?.usd || 0, d.ethereum?.usd || 0, d.solana?.usd || 0]
        };
    } else if (message.type === 'IOT') {
        worker.postMessage({ type: 'PROCESS_IOT', payload: message });
        
        // Queue chart update
        const d = message.data;
        iotUpdate = {
            label: new Date(message.timestamp).toLocaleTimeString(),
            data: [d.temperature, d.humidity, d.cpuUsage]
        };
    }
    
    if (!renderPending) {
        renderPending = true;
        // Defer chart updates to next animation frame
    }
}

// 60fps render loop
function renderLoop() {
    frames++;
    
    if (renderPending) {
        if (cryptoUpdate) {
            updateChartData(cryptoChart, cryptoUpdate.label, cryptoUpdate.data, 20);
            cryptoChart.update();
            cryptoUpdate = null;
        }
        
        if (iotUpdate) {
            updateChartData(iotChart, iotUpdate.label, iotUpdate.data, 50);
            iotChart.update();
            iotUpdate = null;
        }
        
        renderPending = false;
    }
    
    requestAnimationFrame(renderLoop);
}

function updateMetrics() {
    const now = performance.now();
    
    // FPS
    const deltaMs = now - lastFpsTime;
    const currentFps = Math.round((frames * 1000) / deltaMs);
    fpsCounter.textContent = currentFps;
    frames = 0;
    lastFpsTime = now;
    
    // Msg Rate
    const msgDeltaMs = now - lastMsgTime;
    const currentRate = Math.round((messagesReceived * 1000) / msgDeltaMs);
    msgRate.textContent = currentRate;
    messagesReceived = 0;
    lastMsgTime = now;
    
    // Warn if FPS drops below 30
    if (currentFps < 30) {
        fpsCounter.style.color = '#ff3366';
    } else {
        fpsCounter.style.color = '#00ff88';
    }
}

// Drag and drop state
let draggedPanel = null;

function handleDragStart(e) {
    draggedPanel = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.style.opacity = '0.4';
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault(); 
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('over');
}

function handleDragLeave(e) {
    this.classList.remove('over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    if (draggedPanel !== this) {
        // Simple swap logic
        const parent = this.parentNode;
        const draggedNext = draggedPanel.nextSibling === this ? draggedPanel : draggedPanel.nextSibling;
        
        parent.insertBefore(draggedPanel, this);
        parent.insertBefore(this, draggedNext);
    }
    
    return false;
}

document.addEventListener('dragend', (e) => {
    document.querySelectorAll('.panel').forEach(p => {
        p.style.opacity = '1';
        p.classList.remove('over');
    });
});

// Boot
init();
