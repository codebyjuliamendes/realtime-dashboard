# syntax=docker/dockerfile:1

# ---- build: install all deps, compile Tailwind CSS, then drop dev deps ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime: production deps only, non-root ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/app/data
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server.js ./
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/public ./public

RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Run node directly (not npm) so SIGTERM reaches the app and triggers graceful shutdown.
CMD ["node", "server.js"]
