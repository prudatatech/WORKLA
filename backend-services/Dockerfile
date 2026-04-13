# ───────────────────────────────────────────────────────
# 🐳 Workla Backend — Production Dockerfile
# Node 20 Alpine | Multi-stage | Non-root | Health Check
# ───────────────────────────────────────────────────────

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Production Runtime
FROM node:20-alpine
RUN addgroup -S workla && adduser -S workla -G workla
WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
RUN npm ci --omit=dev --ignore-scripts

# Switch to non-root user
USER workla

ENV NODE_ENV=production

# Railway/Render automatically sets PORT.
CMD ["node", "dist/server.js"]
