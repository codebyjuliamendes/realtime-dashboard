# 🌟 NexusDash: Real-Time Event-Driven Dashboard

![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)

NexusDash is a high-performance, real-time dashboard designed for rendering high-frequency streaming data from financial markets and IoT sensors. It emphasizes absolute UI smoothness via Web Workers and Virtual Scrolling, alongside robust backend architecture.

---

## ✨ Features

- **Real-Time WebSockets**: Instant bidirectional data streaming at massive scale.
- **Glassmorphic Dark Mode UI**: Breathtaking aesthetic powered by Tailwind CSS.
- **Virtual Scrolling**: Silky-smooth rendering of 100k+ event logs without DOM bloat.
- **Web Workers**: Offloads complex data transformations from the main thread, maintaining 60 FPS.
- **Circuit Breakers**: Graceful degradation when external upstream APIs fail.
- **Event Sourcing (SQLite)**: Immutable, append-only delta log persisting all system events via `node:sqlite`.
- **WebSocket Backpressure**: Intelligent 50ms batching prevents client buffer bloat under intense data rates.
- **Time-Travel UI**: Drag the history slider to instantly rewind the UI state to a previous point in time.
- **Edge Analytics**: Web Worker performs on-the-fly Z-Score statistical anomaly detection for IoT metrics.

---

## 🛠️ Built With

* **Frontend**: Vanilla JavaScript (ES6+), HTML5, Tailwind CSS (via CDN)
* **Visuals**: Chart.js for responsive streaming charts
* **Backend**: Node.js v24+, Express, `ws`, built-in `node:sqlite`
* **Architecture**: V3 Event Sourcing, Backpressure Batching, Circuit Breakers

---

## 📐 Architecture Diagram

```mermaid
graph TD
    subgraph Frontend [Browser Application]
        UI[Tailwind UI + Chart.js]
        VS[Virtual Scroller]
        WW[Web Worker (Z-Score Analytics)]
        WS_Client[WebSocket Client]
        TimeTravel[Time-Travel Slider]
        
        WS_Client -->|Batched Data| WW
        WW -->|Processed Data| UI
        WS_Client -->|Events| VS
        TimeTravel -->|Fetch History API| UI
    end
    
    subgraph Backend [Node.js Server]
        API[Express API]
        WS_Server[WebSocket Server (50ms Batching)]
        EventStore[(SQLite Event Store)]
        CryptoSvc[Crypto Service]
        IoTSvc[IoT Service]
        CB[Circuit Breaker]
        
        API --> EventStore
        WS_Server --> EventStore
        API --> WS_Server
        CryptoSvc -->|Prices| WS_Server
        IoTSvc -->|Telemetry| WS_Server
        CryptoSvc -.->|External API Call| CB
        CB -.->|CoinGecko| External[External API]
    end
    
    Backend <-->|WebSockets| Frontend
```

---

## 🤔 The "Why" & Trade-offs

### 1. **Why Tailwind CSS via CDN?**
* **Why**: For a quick, zero-build-step deployment that still offers utility-first flexibility to construct a beautiful glassmorphic dark mode UI.
* **Trade-off**: The CDN approach is slightly heavier on initial load compared to a compiled CSS bundle, but provides extreme agility for prototyping and refactoring.

### 2. **Why Web Workers for Data Processing?**
* **Why**: High-frequency WebSocket streams (like IoT ticks at 250ms) can stutter the main thread and drop frames. Moving parsing/transformation to a Worker guarantees UI fluidity.
* **Trade-off**: Increases architectural complexity and adds minor message-passing latency (typically <1ms).

### 3. **Why Virtual Scrolling?**
* **Why**: Attempting to render 100,000 DOM nodes crashes the browser. Virtual scrolling recycles a fixed pool of DOM elements based on scroll position.
* **Trade-off**: Requires manual computation of scroll offsets and heights instead of relying on native browser layout engines.

### 4. **Why Clean Architecture Backend?**
* **Why**: By separating concerns (Services, Routes, Middlewares), the application is highly testable and extensible. Incorporating Circuit Breakers ensures the dashboard doesn't crash when CoinGecko rate-limits the IP.
* **Trade-off**: More files and boilerplate than a single `server.js` monolith.

---

## 🚀 Quick Start

### Prerequisites
- Node.js v16+
- npm or yarn
- Kubernetes (Minikube/Kind) for local K8s deployment
- Docker

### Installation

1. **Clone the repository** (if not already done):
   ```bash
   git clone https://github.com/your-username/realtime-dashboard.git
   cd realtime-dashboard
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   npm start
   ```
   *Alternatively, use `node server.js`*

4. **View the Dashboard**:
   Open your browser and navigate to `http://localhost:3001`.

5. **View API Documentation**:
   Navigate to `http://localhost:3001/api-docs` to access the Swagger UI.

---

## ☸️ Kubernetes Deployment

This project includes Kubernetes manifests for easy deployment:

```bash
kubectl apply -f k8s/
```
This will deploy the dashboard with 2 replicas, a ClusterIP service, and an NGINX Ingress configuration.

---

## 🔄 CI/CD Pipeline

A GitHub Actions workflow is included (`.github/workflows/ci-cd.yml`) which automatically runs tests and simulates a Docker build on push and pull requests to the `main` branch.

---

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
