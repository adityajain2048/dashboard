# Bridge Dashboard V1 — Deployment Mapping

Complete mapping for **local DB** (dev) + **Azure PostgreSQL** (universal/production) + **Vercel** (frontend).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LOCAL (your laptop)                                                        │
│  ┌──────────────┐    ┌─────────────────────────────────────────────────┐   │
│  │ Docker       │    │ Backend (npm run dev)                            │   │
│  │ TimescaleDB  │◄───│ • Fastify API                                    │   │
│  │ bridge_      │    │ • Fetcher + Scheduler                            │   │
│  │ dashboard    │    │ DATABASE_URL → localhost                          │   │
│  └──────────────┘    └─────────────────────────────────────────────────┘   │
│         │                                                                   │
│         │ npm run snapshot:baseline (when you want to push to prod)         │
│         ▼                                                                   │
└─────────┼───────────────────────────────────────────────────────────────────┘
          │
          │  BASELINE_DATABASE_URL = Azure connection string
          │  (run snapshot from local → Azure)
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  AZURE (universal DB — anyone can see)                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Azure Database for PostgreSQL (Flexible Server)                       │   │
│  │ Database: bridge_dashboard                                           │   │
│  │ (Plain PostgreSQL — no TimescaleDB; migrate.ts uses plain schema)     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│         ▲                           ▲                                        │
│         │                           │                                        │
│  snapshot:baseline            Backend (Railway/Render)                       │
│  (from local)                 DATABASE_URL → Azure                           │
└─────────┼───────────────────────────┼────────────────────────────────────────┘
          │                           │
          │                           │ API URL
          │                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  VERCEL                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Frontend (React + Vite)                                               │   │
│  │ VITE_API_URL → https://your-backend.railway.app (or Render URL)       │   │
│  │ (Frontend only — no DB connection)                                    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Note:** The backend (API + fetcher) must run 24/7 somewhere. Vercel only hosts static frontend. Use **Railway** or **Render** for the backend.

---

## 1. Azure PostgreSQL Setup

### 1.1 Create Azure PostgreSQL (Flexible Server)

```bash
# Login (if not already)
az login

# Create resource group
az group create --name rg-bridge-dashboard --location eastus

# Create PostgreSQL Flexible Server
az postgres flexible-server create \
  --resource-group rg-bridge-dashboard \
  --name bridge-dashboard-db \
  --location eastus \
  --admin-user bridgeadmin \
  --admin-password '<STRONG_PASSWORD>' \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16

# Create database
az postgres flexible-server db create \
  --resource-group rg-bridge-dashboard \
  --server-name bridge-dashboard-db \
  --database-name bridge_dashboard

# Allow public access (or restrict to your IP / backend IP later)
az postgres flexible-server firewall-rule create \
  --resource-group rg-bridge-dashboard \
  --name bridge-dashboard-db \
  --rule-name AllowAll \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 255.255.255.255
```

### 1.2 Get connection string

```bash
az postgres flexible-server show-connection-string \
  --server-name bridge-dashboard-db \
  --database-name bridge_dashboard \
  --admin-user bridgeadmin \
  --admin-password '<STRONG_PASSWORD>'
```

Format:  
`postgresql://bridgeadmin:<PASSWORD>@bridge-dashboard-db.postgres.database.azure.com:5432/bridge_dashboard?sslmode=require`

**Save this as `AZURE_DATABASE_URL`** (or `BASELINE_DATABASE_URL` when snapshotting).

---

## 2. Environment Variable Mapping

| Variable | Local (.env) | Backend (Railway/Render) | Vercel (Frontend) |
|----------|--------------|--------------------------|-------------------|
| `DATABASE_URL` | `postgresql://bridge:bridge@localhost:5432/bridge_dashboard` | Azure connection string | — |
| `BASELINE_DATABASE_URL` | Azure connection string (for snapshot target) | — | — |
| `VITE_API_URL` | — | — | `https://your-backend.railway.app` |
| `CORS_ORIGIN` | — | `https://your-app.vercel.app` | — |
| `LIFI_API_KEY_1` | ✓ | ✓ | — |
| `LIFI_API_KEY_2` | ✓ | ✓ | — |
| `LIFI_API_KEY_3` | ✓ | ✓ | — |
| `RANGO_API_KEY` | ✓ | ✓ | — |
| `BUNGEE_API_KEY` | ✓ | ✓ | — |
| `RUBIC_API_KEY` | ✓ | ✓ (optional) | — |
| `PORT` | 3000 | 3000 or env-provided | — |
| `NODE_ENV` | development | production | — |

---

## 3. Step-by-Step Execution Checklist

### Phase A: Azure DB

- [ ] **A1.** Create Azure PostgreSQL (Flexible Server) per §1.1
- [ ] **A2.** Create database `bridge_dashboard`
- [ ] **A3.** Add firewall rule (or restrict to backend IP)
- [ ] **A4.** Copy connection string → `AZURE_DATABASE_URL`

### Phase B: Migrate & Seed Azure DB

- [ ] **B1.** Add to local `.env`:
  ```
  BASELINE_DATABASE_URL=<AZURE_DATABASE_URL>
  ```
- [ ] **B2.** Run migrations on Azure:
  ```bash
  BASELINE_DATABASE_URL="<AZURE_DATABASE_URL>" npm run migrate:baseline
  ```
  (This uses `migrate-baseline.ts` which overrides `DATABASE_URL` with `BASELINE_DATABASE_URL`)
- [ ] **B3.** Snapshot local → Azure:
  ```bash
  npm run snapshot:baseline
  ```
  (Requires `DATABASE_URL` = local, `BASELINE_DATABASE_URL` = Azure)

### Phase C: Backend Hosting (Railway or Render)

#### Option: Railway

- [ ] **C1.** Create project at [railway.app](https://railway.app)
- [ ] **C2.** New service → Deploy from GitHub (this repo)
  - Root directory: project root (not `frontend`)
  - Build: `npm run build` (or use Dockerfile)
  - Start: `npm start`
- [ ] **C3.** Add variables:
  - `DATABASE_URL` = Azure connection string
  - `CORS_ORIGIN` = `https://<your-vercel-app>.vercel.app`
  - `LIFI_API_KEY_1`, `LIFI_API_KEY_2`, `LIFI_API_KEY_3`
  - `RANGO_API_KEY`, `BUNGEE_API_KEY`
  - `NODE_ENV` = `production`
- [ ] **C4.** Set root directory / build: `npm run build && npm start`
- [ ] **C5.** Deploy, copy public URL (e.g. `https://xxx.railway.app`)

#### Option: Render

- [ ] **C1.** Create Web Service at [render.com](https://render.com)
- [ ] **C2.** Connect repo, build: `npm install && npm run build`, start: `npm start`
- [ ] **C3.** Add env vars (same as Railway)
- [ ] **C4.** Deploy, copy URL

### Phase D: Vercel Frontend

- [ ] **D1.** Deploy (already connected via CLI):
  ```bash
  vercel --prod
  ```
- [ ] **D2.** In Vercel dashboard → Project → Settings → Environment Variables:
  - `VITE_API_URL` = `https://your-backend.railway.app` (no trailing slash)
- [ ] **D3.** Redeploy so frontend picks up `VITE_API_URL`

### Phase E: CORS

- [ ] **E1.** In backend env, set `CORS_ORIGIN` = your Vercel URL (e.g. `https://bridge-dashboard.vercel.app`)

---

## 4. Local .env (Final Shape)

```env
# Local DB (Docker)
DATABASE_URL=postgresql://bridge:bridge@localhost:5432/bridge_dashboard

# Azure DB — target for snapshot, and used by production backend
BASELINE_DATABASE_URL=postgresql://bridgeadmin:PASSWORD@bridge-dashboard-db.postgres.database.azure.com:5432/bridge_dashboard?sslmode=require

# API keys (same for local and prod)
LIFI_API_KEY_1=...
LIFI_API_KEY_2=...
LIFI_API_KEY_3=...
RANGO_API_KEY=...
BUNGEE_API_KEY=...
RUBIC_API_URL=

PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

---

## 5. Ongoing Workflow

| Action | Command |
|--------|---------|
| Dev locally | `docker compose up -d` then `npm run dev` |
| Push fresh data to Azure | `npm run snapshot:baseline` |
| Run migrations on Azure | `BASELINE_DATABASE_URL="<azure>" npm run migrate:baseline` |
| Deploy frontend | `vercel --prod` |
| Backend redeploys | Auto on git push (if connected to Railway/Render) |

---

## 6. Fix: migrate-baseline Uses BASELINE_DATABASE_URL

`scripts/migrate-baseline.ts` overrides `DATABASE_URL` with `BASELINE_DATABASE_URL` when calling the migrator. So:

- `npm run migrate:baseline` → runs migrations on `BASELINE_DATABASE_URL` (Azure)
- `npm run snapshot:baseline` → copies from `DATABASE_URL` (local) → `BASELINE_DATABASE_URL` (Azure)

---

## 7. Backend Not on Vercel

Vercel hosts the **frontend only**. The backend (Fastify + fetcher + scheduler) must run on a platform that supports long-running processes:

- **Railway** — simple, good free tier
- **Render** — free tier, slower cold starts
- **Azure App Service** — same cloud as DB, low latency

The frontend calls `VITE_API_URL`; that URL must point to your hosted backend.

---

## 8. Quick Reference: URLs to Fill

| Placeholder | Replace With |
|-------------|--------------|
| `<AZURE_DATABASE_URL>` | From `az postgres flexible-server show-connection-string` |
| `<your-backend.railway.app>` | Railway/Render public URL |
| `<your-app.vercel.app>` | Vercel deployment URL |
