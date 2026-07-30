// Web Worker for processing high-frequency data off the main thread

let iotDataBuffer = [];
let cryptoDataBuffer = [];

// Simple moving average calculation
function calculateSMA(data, key, windowSize) {
    if (data.length === 0) return 0;
    const slice = data.slice(-windowSize);
    const sum = slice.reduce((acc, val) => acc + val.data[key], 0);
    return (sum / slice.length).toFixed(2);
}

// Anomaly detection
function detectAnomalies(data) {
    if (data.length === 0) return null;
    const latest = data[data.length - 1].data;
    
    if (latest.temperature > 32) return "High Temp";
    if (latest.cpuUsage > 90) return "High CPU";
    
    return null;
}

self.onmessage = (e) => {
    const message = e.data;
    
    if (message.type === 'PROCESS_IOT') {
        iotDataBuffer.push(message.payload);
        // Keep buffer size manageable
        if (iotDataBuffer.length > 500) {
            iotDataBuffer.shift();
        }
        
        // Compute statistics every 5 messages to save cycles
        if (iotDataBuffer.length % 5 === 0) {
            const avgTemp = calculateSMA(iotDataBuffer, 'temperature', 20);
            const avgCpu = calculateSMA(iotDataBuffer, 'cpuUsage', 20);
            const anomaly = detectAnomalies(iotDataBuffer);
            
            self.postMessage({
                type: 'IOT_STATS',
                payload: {
                    avgTemp,
                    avgCpu,
                    anomaly
                }
            });
        }
    } else if (message.type === 'PROCESS_CRYPTO') {
        cryptoDataBuffer.push(message.payload);
        if (cryptoDataBuffer.length > 100) {
            cryptoDataBuffer.shift();
        }
        
        // Price formatting
        const latest = message.payload.data;
        self.postMessage({
            type: 'CRYPTO_STATS',
            payload: {
                btc: latest.bitcoin.usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
                eth: latest.ethereum.usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
                sol: latest.solana.usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
            }
        });
    }
};
