# Multi-stage build
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

FROM node:18-alpine

WORKDIR /app
COPY --from=builder /app ./

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["npm", "start"]
