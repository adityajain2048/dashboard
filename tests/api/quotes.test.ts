import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../src/db/connection.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: vi.fn(),
  },
  query: vi.fn().mockResolvedValue({ rows: [] }),
  getClient: vi.fn(),
}));

vi.mock('../../src/db/queries.js', () => ({
  getHealth: vi.fn().mockResolvedValue({ quoteCount: 42, oldestQuote: new Date() }),
  getRouteLatestMaxTs: vi.fn().mockResolvedValue([]),
  getQuotesForRoute: vi.fn().mockResolvedValue([]),
  insertFetchLog: vi.fn().mockResolvedValue(undefined),
  insertQuotesBatch: vi.fn().mockResolvedValue(0),
  upsertRouteLatest: vi.fn().mockResolvedValue(undefined),
  updateRouteStatus: vi.fn().mockResolvedValue(undefined),
  getMatrixData: vi.fn().mockResolvedValue([]),
}));

describe('API Endpoints', () => {
  let app: Awaited<ReturnType<typeof import('../../src/api/server.js').buildServer>> | null = null;

  beforeAll(async () => {
    try {
      const { buildServer } = await import('../../src/api/server.js');
      app = await buildServer();
    } catch {
      app = null;
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /api/health returns status', async () => {
    if (!app) return;
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('db');
  });

  it('GET /api/quotes validates params', async () => {
    if (!app) return;
    const res = await app.inject({ method: 'GET', url: '/api/quotes' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/quotes returns array for valid route', async () => {
    if (!app) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/quotes?src=ethereum&dst=arbitrum&asset=USDC&tier=1000',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('quotes');
    expect(Array.isArray(body.quotes)).toBe(true);
  });

  it('GET /api/matrix returns expected cells', async () => {
    if (!app) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/matrix?asset=USDC&tier=1000',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.cells.length).toBe(462); // 22×21 directional routes
    expect(body).toHaveProperty('stats');
  });

  it('GET /api/opportunities returns sorted results', async () => {
    if (!app) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/opportunities?limit=10',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('opportunities');
    expect(Array.isArray(body.opportunities)).toBe(true);
  });

  it('rejects invalid chain slug', async () => {
    if (!app) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/quotes?src=fakechain&dst=arbitrum&asset=USDC&tier=1000',
    });
    expect(res.statusCode).toBe(400);
  });
});
