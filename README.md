# Event-Driven Real-Time Dashboard

## The Why
This project provides a robust, real-time data visualization platform designed to monitor multiple data streams concurrently—such as cryptocurrency market prices and telemetry from IoT infrastructure. High-frequency data demands a responsive architecture, avoiding sluggish UI updates or blocked main threads. By separating the data intake logic from the rendering logic and utilizing off-main-thread computation, we achieve a highly performant and resilient system capable of real-time monitoring.

## Architecture

```mermaid
flowchart TD
    subgraph External
        CG[CoinGecko API]
    end

    subgraph Backend Server Node.js
        CB[Circuit Breaker & Backoff]
        IOT[Simulated IoT Telemetry]
        API[REST API / Historical]
        WS_SERVER[WebSocket Server]
        
        CG --> CB
        CB --> WS_SERVER
        IOT --> WS_SERVER
    end

    subgraph Frontend Browser
        WS_CLIENT[WebSocket Client]
        WORKER[Web Worker Data Processing]
        
        subgraph UI Thread
            CHART[Chart.js / Real-time Charts]
            TABLE[Virtual Scrolling Table]
        end
        
        WS_SERVER <-->|ws://| WS_CLIENT
        WS_CLIENT --> WORKER
        WORKER -->|Computed Stats & Anomalies| UI Thread
    end
```

## Trade-offs
1. **Vanilla JS over React/Vue**: By relying purely on Vanilla JS, we eliminate the VDOM diffing overhead and massive framework bundle sizes. Real-time updates every few milliseconds can cause severe rendering bottlenecks in reactive frameworks unless strictly optimized (e.g., bypassing state). Native DOM manipulation paired with Canvas (Chart.js) provides deterministic 60fps performance for streaming data.
2. **Chart.js over D3.js**: While D3 offers unparalleled flexibility for bespoke data visualizations, Chart.js provides out-of-the-box performant HTML5 Canvas rendering for standard charts. Using Canvas is much faster for high-frequency time-series data compared to D3's SVG manipulation.
3. **Virtual Scrolling over Pagination**: Standard tables crash the browser when rendering 100,000+ DOM nodes. By implementing virtual scrolling, we only render the ~20 rows currently visible in the viewport, ensuring constant memory usage regardless of dataset size.
4. **Web Workers over Main Thread Processing**: Aggregating stats (min, max, averages, anomalies) on incoming streams blocks the UI thread if done synchronously. Offloading this to a Web Worker keeps chart animations buttery smooth.

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to `http://localhost:3000`.

## Performance
- **Target:** Solid 60FPS during active data streaming.
- **Techniques Used:** 
  - Hardware-accelerated CSS transforms and transitions.
  - HTML5 Canvas for real-time charting (Chart.js).
  - DOM virtualization for the event log (rendering only visible rows).
  - Web Workers for parsing, formatting, and aggregating heavy data payloads.
  - RequestAnimationFrame (rAF) batching for UI updates.
