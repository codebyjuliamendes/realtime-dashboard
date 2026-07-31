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

// Anomaly detection using Z-Score
function detectAnomalies(data) {
    if (data.length < 10) return null; // Need enough data points for Z-Score
    const latest = data[data.length - 1].data;
    
    // Calculate for temperature
    const temps = data.map(d => d.data.temperature);
    const meanTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
    const stdDevTemp = Math.sqrt(temps.reduce((a, b) => a + Math.pow(b - meanTemp, 2), 0) / temps.length);
    const zScoreTemp = stdDevTemp === 0 ? 0 : Math.abs((latest.temperature - meanTemp) / stdDevTemp);
    
    if (zScoreTemp > 3) return "High Temp Anomaly (Z-Score)";
    
    // Calculate for CPU
    const cpus = data.map(d => d.data.cpuUsage);
    const meanCpu = cpus.reduce((a, b) => a + b, 0) / cpus.length;
    const stdDevCpu = Math.sqrt(cpus.reduce((a, b) => a + Math.pow(b - meanCpu, 2), 0) / cpus.length);
    const zScoreCpu = stdDevCpu === 0 ? 0 : Math.abs((latest.cpuUsage - meanCpu) / stdDevCpu);

    if (zScoreCpu > 3) return "High CPU Anomaly (Z-Score)";
    
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
