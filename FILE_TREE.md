# File Tree — Bridge Rate Dashboard

```
bridge-dashboard/
├── CLAUDE.md                           # Project context for Claude Code
├── docker-compose.yml                  # TimescaleDB + app services
├── Dockerfile                          # Multi-stage Node build
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
│
├── migrations/
│   └── 001_init.sql                    # Full TimescaleDB schema
│
├── src/
│   ├── index.ts                        # Entry: starts fetcher scheduler + API server
│   │
│   ├── config/
│   │   ├── chains.ts                   # 30 chains — id, name, type, native token
│   │   ├── routes.ts                   # 870 routes — tier classification, generates full grid
│   │   ├── bridges.ts                  # 17 bridges — API endpoints, auth, aggregator mapping
│   │   └── tokens.ts                   # Token addresses per chain (USDC, USDT, native)
│   │
│   ├── types/
│   │   └── index.ts                    # All shared interfaces
│   │
│   ├── db/
│   │   ├── connection.ts               # pg Pool singleton
│   │   ├── migrate.ts                  # Reads migrations/ and applies
│   │   └── queries.ts                  # Typed insert/upsert/select functions
│   │
│   ├── fetcher/
│   │   ├── scheduler.ts                # 3-tier setInterval orchestrator
│   │   ├── pipeline.ts                 # Per-route fetch pipeline (agg → gap-fill → normalize → insert)
│   │   ├── normalizer.ts               # Maps raw API responses → NormalizedQuote
│   │   ├── aggregators/
│   │   │   ├── index.ts                # Aggregator registry + fan-out function
│   │   │   ├── lifi.ts                 # LI.FI /v1/quote endpoint
│   │   │   └── rango.ts               # Rango /routing/best endpoint
│   │   └── bridges/
│   │       ├── index.ts                # Bridge registry + gap-fill dispatch
│   │       ├── across.ts               # Across /suggested-fees
│   │       └── stargate.ts             # Stargate /v1/quote
│   │
│   ├── api/
│   │   ├── server.ts                   # Fastify instance + plugin registration
│   │   └── routes/
│   │       ├── quotes.ts               # GET /api/quotes?src=&dst=&asset=&tier=
│   │       ├── matrix.ts               # GET /api/matrix?asset=&tier=
│   │       ├── opportunities.ts        # GET /api/opportunities (widest spreads)
│   │       └── health.ts               # GET /api/health (fetcher status)
│   │
│   └── lib/
│       ├── logger.ts                   # Pino structured logger
│       └── utils.ts                    # Shared helpers (retry, sleep, chunk)
│
├── scripts/
│   ├── verify-db.ts                    # Check tables, insert test row, read back
│   └── verify-fetcher.ts              # Fetch 1 route (ETH→ARB USDC), print quotes
│
└── tests/
    ├── config/
    │   └── routes.test.ts              # Verify 870 routes, tier counts
    ├── fetcher/
    │   ├── normalizer.test.ts          # Unit: normalize each aggregator format
    │   └── pipeline.test.ts            # Unit: mock aggregator → DB flow
    └── api/
        └── quotes.test.ts             # Integration: query quotes endpoint
```
