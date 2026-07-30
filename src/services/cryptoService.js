import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { wsService } from './websocketService.js';

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd';

class CryptoService {
    constructor() {
        this.circuitBreaker = new CircuitBreaker(100, 30000);
        this.intervalId = null;
    }

    /**
     * Starts the crypto fetching loop.
     * @param {number} intervalMs 
     */
    start(intervalMs = 10000) {
        this.fetchData();
        this.intervalId = setInterval(() => this.fetchData(), intervalMs);
    }

    /**
     * Stops the crypto fetching loop.
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Fetches crypto data from the remote API or falls back to simulation.
     */
    async fetchData() {
        if (!this.circuitBreaker.canRequest()) {
            return;
        }

        try {
            const response = await fetch(COINGECKO_URL, {
                headers: { 'Accept': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.circuitBreaker.recordSuccess();
            
            wsService.broadcast({
                type: 'CRYPTO',
                data: data
            });
            
        } catch (error) {
            console.error('Crypto API Error:', error.message);
            
            const delay = this.circuitBreaker.recordFailure();
            
            wsService.broadcast({
                type: 'SYSTEM_ERROR',
                message: `Crypto API unavailable. Retrying in ${delay}ms`
            });
            
            // Graceful degradation
            wsService.broadcast({
                type: 'CRYPTO',
                isSimulated: true,
                data: {
                    bitcoin: { usd: 65000 + (Math.random() - 0.5) * 1000 },
                    ethereum: { usd: 3500 + (Math.random() - 0.5) * 50 },
                    solana: { usd: 140 + (Math.random() - 0.5) * 5 }
                }
            });
        }
    }
}

export const cryptoService = new CryptoService();
