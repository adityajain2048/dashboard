# Bridge Dashboard — Claude Code Handoff Package

## What This Is
Everything Claude Code needs to build the bridge rate dashboard from scratch, broken into 5 independent sessions. Each session is a single prompt that produces a verifiable deliverable.

## File Inventory

### Project Files (copy into repo root before Session 1)
```
CLAUDE.md                       → bridge-dashboard/CLAUDE.md
FILE_TREE.md                    → Reference only (don't copy into repo)
migrations_001_init.sql         → bridge-dashboard/migrations/001_init.sql
src_types_index.ts              → bridge-dashboard/src/types/index.ts
src_config_chains.ts            → bridge-dashboard/src/config/chains.ts
src_config_routes.ts            → bridge-dashboard/src/config/routes.ts
src_config_bridges.ts           → bridge-dashboard/src/config/bridges.ts
src_config_tokens.ts            → bridge-dashboard/src/config/tokens.ts
```

### Session Prompts (feed one at a time to Claude Code)
```
sessions/SESSION_1_SCAFFOLD.md  → Project init, Docker, DB schema, migrations
sessions/SESSION_2_FETCHER.md   → LI.FI + Rango clients, normalizer, scheduler
sessions/SESSION_3_API.md       → Fastify REST API (quotes, matrix, opportunities, health)
sessions/SESSION_4_GAPFILL.md   → Bungee + Rubic + direct bridge gap-fill
sessions/SESSION_5_DASHBOARD.md → React + Tailwind frontend (Route Explorer + Heatmap)
```

## Session 1 Verification (after scaffold)

With Docker Compose installed, run:

```bash
# 1. TypeScript compiles
npx tsc --noEmit

# 2. Tests pass
npx vitest run

# 3. Start TimescaleDB
docker compose up -d db
sleep 3

# 4. Run migrations
npx tsx src/db/migrate.ts

# 5. DB verification script
npm run verify:db

# 6. Entry point (Ctrl+C to exit)
npx tsx src/index.ts   # Should log "Database connected"
```

Copy `.env.example` to `.env` and set `DATABASE_URL` if needed (default: `postgresql://bridge:bridge@localhost:5432/bridge_dashboard`).

## How To Run

### Step 0: Repo Setup
```bash
mkdir bridge-dashboard && cd bridge-dashboard
git init

# Copy project files into correct paths:
cp /path/to/handoff/CLAUDE.md .
mkdir -p migrations src/types src/config
cp /path/to/handoff/migrations_001_init.sql migrations/001_init.sql
cp /path/to/handoff/src_types_index.ts src/types/index.ts
cp /path/to/handoff/src_config_chains.ts src/config/chains.ts
cp /path/to/handoff/src_config_routes.ts src/config/routes.ts
cp /path/to/handoff/src_config_bridges.ts src/config/bridges.ts
cp /path/to/handoff/src_config_tokens.ts src/config/tokens.ts
```

### Step 1-5: Run Sessions
For each session:

1. **Start a fresh Claude Code session** (`/clear` if reusing terminal)
2. **Paste the full contents of the SESSION_N file** as your prompt
3. **Let Claude Code execute.** It will:
   - Read CLAUDE.md for context
   - Create all files specified in the session
   - Run the verification checks at the bottom
4. **Confirm all verification checks pass** before moving to the next session
5. **`git add -A && git commit -m "Session N: [description]"`**

### Session Dependencies
```
Session 1 (Scaffold)    → No deps. Creates project from scratch.
Session 2 (Fetcher)     → Requires Session 1 (needs DB + config)
Session 3 (API)         → Requires Session 1 (needs DB + types)
                          Session 2 recommended (API reads fetcher data)
Session 4 (Gap-fill)    → Requires Sessions 1+2 (extends fetcher)
Session 5 (Dashboard)   → Requires Sessions 1+2+3 (needs API endpoints)
```

Sessions 2 and 3 can technically run in parallel (they don't touch each other's files), but 3 is more useful after 2 has populated the database.

### Environment
Before Session 1, create `.env`:
```bash
DATABASE_URL=postgresql://bridge:bridge@localhost:5432/bridge_dashboard
LIFI_API_KEY_1=c4efa07b-1833-4be8-805c-f3c19c9505ca.02ed2862-2d19-4c86-8c7f-7bce482eb73d
LIFI_API_KEY_2=db172bc8-daef-4277-8480-8541ea31aa40.371afcda-2f75-4e0a-ae4a-53ba6a68979a
LIFI_API_KEY_3=0f38064d-076f-4f22-a938-44bbd0f08aeb.139194ff-d0cd-415f-9450-834b3b4f9a58
RANGO_API_KEY=c6381a79-2817-4602-83bf-6a641a409e32
BUNGEE_API_KEY=72a5b4b0-e727-48be-8aa1-5da9d62fe635
RUBIC_API_KEY=
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

You need Docker installed for the TimescaleDB container.

## What Each Session Produces

| Session | Files Created | Deliverable | Verification |
|---------|--------------|-------------|-------------|
| 1 | package.json, docker-compose.yml, Dockerfile, tsconfig.json, src/lib/*, src/db/*, scripts/verify-db.ts, tests/config/* | `docker compose up` works, tables exist | `npm run verify:db` + `npx vitest run` |
| 2 | src/fetcher/scheduler.ts, pipeline.ts, normalizer.ts, aggregators/lifi.ts, aggregators/rango.ts, scripts/verify-fetcher.ts, tests/fetcher/* | Fetcher runs, quotes land in DB | `npm run verify:fetcher` |
| 3 | src/api/server.ts, routes/quotes.ts, routes/matrix.ts, routes/opportunities.ts, routes/health.ts, tests/api/* | All API endpoints return valid JSON | `curl` all endpoints, status codes correct |
| 4 | src/fetcher/aggregators/bungee.ts, rubic.ts, bridges/across.ts, relay.ts, mayan.ts, meson.ts, bridges/index.ts, tests/fetcher/gap-fill.test.ts | 4 aggregators + 4 direct bridges fetching | Multiple sources in quote results |
| 5 | frontend/* (Vite + React + Tailwind), src/api/server.ts update for static serving | Working dashboard with heatmap | Frontend builds and displays data |

## Architecture Summary
```
┌─────────────────────────────────────────────────────────┐
│                    SCHEDULER                             │
│  Tier 1 (60s) → 80 routes   ──┐                        │
│  Tier 2 (2m)  → 200 routes  ──┼──→ PIPELINE            │
│  Tier 3 (5m)  → 290 routes  ──┘    │                   │
│                                      ▼                   │
│  ┌──────────────────────────────────────────────┐       │
│  │ 1. Fan-out to aggregators (parallel)          │       │
│  │    LI.FI + Rango + Bungee + Rubic            │       │
│  │ 2. Gap-fill: query missing bridges directly   │       │
│  │    Across, Relay, Mayan, Meson                │       │
│  │ 3. Deduplicate (same bridge, keep best)       │       │
│  │ 4. Rank by output (best → worst)              │       │
│  │ 5. Bulk INSERT into TimescaleDB               │       │
│  │ 6. UPSERT route_latest + route_status         │       │
│  └──────────────────────────────────────────────┘       │
│                                                          │
│  ┌──────────────────────────────────────────────┐       │
│  │ FASTIFY API                                    │       │
│  │  /api/quotes?src=&dst=&asset=&tier=           │       │
│  │  /api/matrix?asset=&tier=                     │       │
│  │  /api/opportunities?limit=&minSpreadBps=      │       │
│  │  /api/health                                   │       │
│  └──────────────────────────────────────────────┘       │
│                                                          │
│  ┌──────────────────────────────────────────────┐       │
│  │ REACT DASHBOARD                                │       │
│  │  Route Explorer (search + compare quotes)     │       │
│  │  Heatmap (30×30 matrix, all 870 routes)       │       │
│  │  Opportunities (top spreads for solvers)       │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## Troubleshooting

**Claude Code context fills up mid-session:**
If Claude Code triggers compaction, the session prompt is self-contained — it can re-read CLAUDE.md to recover context. Each session is designed to stay under 15-20 tool calls.

**Network issues in Session 2/4 (API calls fail):**
The verification scripts handle this gracefully. Unit tests mock external calls. If real API calls fail, the pipeline still works — just returns empty quotes.

**TimescaleDB extension not available:**
Make sure you're using `timescale/timescaledb:latest-pg16` image, not plain postgres.

**Session takes too long:**
Each session should complete in 10-20 minutes of Claude Code time. If it stalls, `/clear` and re-paste the prompt.
