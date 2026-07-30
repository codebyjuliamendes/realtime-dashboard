import { wsService } from './websocketService.js';

class IoTService {
    constructor() {
        this.intervalId = null;
    }

    /**
     * Starts the IoT data simulation.
     * @param {number} intervalMs 
     */
    start(intervalMs = 250) {
        this.intervalId = setInterval(() => this.generateData(), intervalMs);
    }

    /**
     * Stops the IoT data simulation.
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Generates fake IoT telemetry data and broadcasts it.
     */
    generateData() {
        const data = {
            type: 'IOT',
            data: {
                temperature: 20 + Math.random() * 15, // 20 - 35 C
                humidity: 40 + Math.random() * 40,    // 40 - 80 %
                cpuUsage: Math.random() * 100         // 0 - 100 %
            }
        };
        wsService.broadcast(data);
    }
}

export const iotService = new IoTService();
