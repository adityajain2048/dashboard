# SESSION 5: Dashboard UI — Route Explorer + Heatmap

## GOAL
Build a React + Tailwind frontend dashboard with two main views: the Route Explorer (search and compare quotes for a specific corridor) and the Matrix Heatmap (30×30 grid showing all route states and spreads). Served as static files by Fastify.

## PREREQUISITES
Sessions 1-4 complete. Verify:
```bash
npx tsc --noEmit && npx vitest run
# Start app and confirm API returns data:
npx tsx src/index.ts &
sleep 5
curl -s "http://localhost:3000/api/health" | jq .status
curl -s "http://localhost:3000/api/matrix?asset=USDC&tier=1000" | jq '.stats.active'
kill %1
```

## CONTEXT
The dashboard is a single-page React app built with Vite, served as static files. It queries the API endpoints built in Session 3. All data comes from the REST API — no direct DB access from the frontend.

---

## STEP 1: Frontend Setup

Create `frontend/` directory alongside `src/`:

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss @tailwindcss/vite
```

Configure:
- `vite.config.ts`: proxy `/api` to `http://localhost:3000` in dev
- `tailwind.config.js`: content paths for `src/**/*.{ts,tsx}`
- `src/index.css`: import Tailwind layers

## STEP 2: API Client

Create `frontend/src/api/client.ts`:

```typescript
const BASE = import.meta.env.DEV ? '' : '';  // Proxy handles /api in dev

export async function fetchQuotes(src: string, dst: string, asset: string, tier: number) {
  const res = await fetch(`${BASE}/api/quotes?src=${src}&dst=${dst}&asset=${asset}&tier=${tier}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchMatrix(asset: string, tier: number) {
  const res = await fetch(`${BASE}/api/matrix?asset=${asset}&tier=${tier}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchOpportunities(limit = 20, minSpreadBps = 0) {
  const res = await fetch(`${BASE}/api/opportunities?limit=${limit}&minSpreadBps=${minSpreadBps}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchHealth() {
  const res = await fetch(`${BASE}/api/health`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

## STEP 3: Layout + Navigation

Create `frontend/src/App.tsx`:

Three tabs: **Route Explorer** | **Heatmap** | **Opportunities**

Top bar shows:
- Dashboard title: "Bridge Rate Explorer"
- Health indicator: green dot if ok, yellow if degraded, red if down (poll /api/health every 30s)
- Asset selector: ETH | USDC | USDT (defaults to USDC)
- Amount tier selector: $50 | $1,000 | $50,000 (defaults to $1,000)

Use React state + URL params for current view and filters.

## STEP 4: Route Explorer View

Create `frontend/src/views/RouteExplorer.tsx`:

**Controls:**
- Source chain dropdown (30 chains, grouped by type: EVM L1, EVM L2, Non-EVM)
- Destination chain dropdown (same)
- Swap button (↔) to flip src/dst
- Asset + tier inherited from top bar

**Quotes Table:** (fetches on param change)
| Rank | Bridge | Source | Output | Fee (bps) | Fee (USD) | Gas (USD) | Est. Time | Spread |
|------|--------|--------|--------|-----------|-----------|-----------|-----------|--------|
| 1 🏆 | Across | LI.FI | $999.85 | 15 bps | $0.15 | $0.12 | 12s | — |
| 2    | Stargate | Rango | $999.40 | 60 bps | $0.60 | $0.18 | 45s | 45 bps |
| ...  |        |        |         |           |           |           |           |        |

Styling:
- Rank 1 row: highlighted with green left border
- Spread column: color-coded (green <30bps, yellow 30-100bps, orange 100-200bps, red >200bps)
- "No quotes available" message if empty
- Loading spinner while fetching
- Auto-refresh every 60s (with countdown timer showing "Refreshing in 45s...")

## STEP 5: Heatmap View

Create `frontend/src/views/Heatmap.tsx`:

30×30 grid rendered as a CSS Grid or HTML table.

**Layout:**
- Row headers: source chains (left side, in HEATMAP_ORDER)
- Column headers: destination chains (top, in HEATMAP_ORDER, rotated 45°)
- Diagonal cells (self-to-self): dark background, no data
- Each cell is ~20×20px (the grid is tight)

**Cell coloring by state:**
- `active`: colored by spread_bps
  - Green (#22c55e): spread < 30 bps (tight, competitive)
  - Yellow (#eab308): spread 30-100 bps
  - Orange (#f97316): spread 100-200 bps
  - Red (#ef4444): spread > 200 bps
- `dead`: dark grey (#374151) with small ✗
- `stale`: dimmed version of its color with ⚠️ badge
- `single-bridge`: blue outline (#3b82f6) — no spread calculable

**Interactions:**
- Hover: tooltip showing "ETH → ARB: 5 bridges, spread 15 bps, best: Across"
- Click: navigates to Route Explorer with that src/dst pre-selected

**Stats bar** below the grid:
- "Active: 412 | Dead: 300 | Stale: 8 | Single-bridge: 150"
- "Last updated: 12 seconds ago"

Data source: `GET /api/matrix?asset=USDC&tier=1000` — returns all 870 cells.
Auto-refresh every 60s.

## STEP 6: Opportunities View

Create `frontend/src/views/Opportunities.tsx`:

**Table:** Top routes by spread (widest spread = most solver opportunity)

| # | Route | Asset | Spread | Best Bridge | Best Output | Worst Bridge | Worst Output | # Bridges |
|---|-------|-------|--------|-------------|-------------|--------------|--------------|-----------|
| 1 | SOL → BASE | USDC | 85 bps | deBridge | $999.15 | Wormhole | $990.65 | 4 |
| 2 | ETH → AVAX | USDC | 72 bps | Across | $999.28 | cBridge | $992.08 | 6 |

Controls:
- Min spread filter slider (0-500 bps)
- Limit dropdown (10, 20, 50, 100)

Row click → navigates to Route Explorer for that route.

## STEP 7: Serve Frontend From Fastify

**Option A (recommended for dev):** Run Vite dev server on port 5173, proxy API calls to port 3000.

**Option B (production):** Build frontend, serve static files from Fastify:

Update `src/api/server.ts`:
```typescript
import fastifyStatic from '@fastify/static';
import path from 'path';

// In production, serve built frontend
if (process.env.NODE_ENV === 'production') {
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '../../frontend/dist'),
    prefix: '/',
  });

  // SPA fallback: serve index.html for non-API routes
  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile('index.html');
  });
}
```

Add to package.json scripts:
```json
"build:frontend": "cd frontend && npm run build",
"build:all": "npm run build && npm run build:frontend"
```

## STEP 8: Responsive + Performance

- Mobile: heatmap becomes scrollable horizontally, cells shrink
- Memoize matrix data (don't re-render 870 cells on every state change)
- Debounce chain selector changes (don't fire API calls on every keystroke)
- Show skeleton loaders instead of spinners

## VERIFICATION

```bash
# 1. Frontend builds
cd frontend && npm run build && cd ..

# 2. Start backend
npx tsx src/index.ts &
sleep 5

# 3. Serve frontend in dev mode
cd frontend && npm run dev &
sleep 3

# 4. Check frontend loads (dev server)
curl -s http://localhost:5173/ | head -5
# Expected: HTML with React root element

# 5. Check API proxy works through Vite
curl -s http://localhost:5173/api/health | jq .status
# Expected: "ok" or "degraded"

# 6. Production build works when served by Fastify
cd frontend && npm run build && cd ..
NODE_ENV=production npx tsx src/index.ts &
sleep 3
curl -s http://localhost:3000/ | head -5
# Expected: HTML with React app
curl -s http://localhost:3000/api/health | jq .status
# Expected: "ok"

# 7. Cleanup
kill %1 %2 2>/dev/null
```

The dashboard should be functional and display real data from the API. Heatmap should show colored cells for active routes and grey cells for dead routes.
