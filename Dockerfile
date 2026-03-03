# ── Stage 1: Install all deps (backend + frontend) ──
FROM node:20-slim AS builder
WORKDIR /app

# Backend deps
COPY package.json package-lock.json* ./
RUN npm ci

# Frontend deps
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN cd frontend && npm ci

# Copy source
COPY . .

# Build backend (TypeScript → dist/)
RUN npm run build

# Build frontend (React → frontend/dist/)
RUN cd frontend && npm run build

# ── Stage 2: Production image ──
FROM node:20-slim
WORKDIR /app

# Only production deps for backend
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Backend build output
COPY --from=builder /app/dist ./dist

# Frontend build output (served by Fastify in production)
COPY --from=builder /app/frontend/dist ./frontend/dist

# Migrations (run at startup)
COPY migrations ./migrations

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/src/index.js"]
