import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

import apiRoutes from './src/api/routes.js';
import { errorHandler } from './src/middlewares/errorHandler.js';
import { wsService } from './src/services/websocketService.js';
import { cryptoService } from './src/services/cryptoService.js';
import { iotService } from './src/services/iotService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;

// Middleware
try {
    app.use(helmet());
    app.use(cors());
    app.use(compression());
} catch (error) {
    console.error('Failed to apply security middlewares:', error);
}
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Swagger API Docs
app.get('/api-docs', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css">
      <title>API Documentation</title>
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
      <script>
        window.onload = () => {
          window.ui = SwaggerUIBundle({
            url: '/swagger.json',
            dom_id: '#swagger-ui',
          });
        };
      </script>
    </body>
    </html>
    `);
});

// Routes
app.use('/api', apiRoutes);

// Error Handling Middleware
app.use(errorHandler);

// Initialize WebSocket Service
wsService.init(server);

// Start Background Services
cryptoService.start(10000); // Every 10 seconds
iotService.start(250);      // Every 250ms

// Start Server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
