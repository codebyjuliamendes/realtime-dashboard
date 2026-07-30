import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Simple REST API for historical data query
app.get('/api/history', (req, res) => {
    res.json({
        status: 'success',
        data: eventLog.slice(-100) // Return last 100 events
    });
});

// State
let clients = new Set();
let eventLog = []; // Simulated database of events
const MAX_LOG_SIZE = 100000;

wss.on('connection', (ws) => {
    clients.add(ws);
    
    // Send initial connection success
    ws.send(JSON.stringify({ type: 'SYSTEM', message: 'Connected to Real-Time Dashboard Server' }));
    
    ws.on('close', () => {
        clients.delete(ws);
    });
});

function broadcast(data) {
    const payload = JSON.stringify(data);
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
    
    // Store in historical log
    eventLog.push(data);
    if (eventLog.length > MAX_LOG_SIZE) {
        eventLog.shift();
    }
}

// --- CoinGecko API integration with Circuit Breaker and Exponential Backoff ---
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd';

let circuitBreaker = {
    failures: 0,
    isOpen: false,
    nextTry: 0,
    backoffBase: 100, // 100ms
    maxBackoff: 30000 // 30s
};

async function fetchCryptoData() {
    const now = Date.now();
    
    if (circuitBreaker.isOpen) {
        if (now < circuitBreaker.nextTry) {
            return; // Skip fetch, breaker is open
        }
        // Half-open state, try again
    }

    try {
        const response = await fetch(COINGECKO_URL, {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Success: reset circuit breaker
        circuitBreaker.failures = 0;
        circuitBreaker.isOpen = false;
        
        broadcast({
            type: 'CRYPTO',
            timestamp: Date.now(),
            data: data
        });
        
    } catch (error) {
        console.error('Crypto API Error:', error.message);
        
        // Increment failures and calculate exponential backoff
        circuitBreaker.failures++;
        circuitBreaker.isOpen = true;
        
        const delay = Math.min(
            circuitBreaker.backoffBase * Math.pow(2, circuitBreaker.failures - 1),
            circuitBreaker.maxBackoff
        );
        
        circuitBreaker.nextTry = now + delay;
        
        broadcast({
            type: 'SYSTEM_ERROR',
            timestamp: Date.now(),
            message: `Crypto API unavailable. Retrying in ${delay}ms`
        });
        
        // Graceful degradation: send simulated crypto data
        broadcast({
            type: 'CRYPTO',
            timestamp: Date.now(),
            isSimulated: true,
            data: {
                bitcoin: { usd: 65000 + (Math.random() - 0.5) * 1000 },
                ethereum: { usd: 3500 + (Math.random() - 0.5) * 50 },
                solana: { usd: 140 + (Math.random() - 0.5) * 5 }
            }
        });
    }
}

// Fetch crypto data periodically (e.g., every 10 seconds)
setInterval(fetchCryptoData, 10000);
// Initial fetch
fetchCryptoData();

// --- Simulated IoT Telemetry Generator ---
function generateIoTData() {
    const data = {
        type: 'IOT',
        timestamp: Date.now(),
        data: {
            temperature: 20 + Math.random() * 15, // 20 - 35 C
            humidity: 40 + Math.random() * 40,   // 40 - 80 %
            cpuUsage: Math.random() * 100        // 0 - 100 %
        }
    };
    broadcast(data);
}

// Generate IoT data rapidly
setInterval(generateIoTData, 250);

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
