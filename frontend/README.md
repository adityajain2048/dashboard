# Bridge Rate Dashboard — Frontend

React + TypeScript + Vite dashboard for visualising cross-chain bridge rates, fees, and route coverage fetched from the backend API.

## What it shows

- **Route explorer** — browse all monitored corridors (chain pair × asset × amount tier), compare quotes from LI.FI, Rango, Bungee, Squid, and direct bridge APIs side-by-side
- **Squid view** — dedicated view focused on Squid's coverage and how it compares to competitors
- **Fee charts** — historical fee trends per route using Recharts
- **Live status** — best bridge, worst bridge, and current fee in basis points for every route

## Quick start

```bash
# From the frontend/ directory:
npm install
npm run dev        # Dev server with HMR at http://localhost:5173
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
```

The frontend calls the backend REST API. In development it proxies `/api` requests to `http://localhost:3000` (configured in `vite.config.ts`). Make sure the backend is running (`npm run dev` from the repo root).

## Stack

- **React 19** with TypeScript (strict)
- **Recharts** for charts
- **Vite** for bundling
- No CSS framework — plain CSS modules
