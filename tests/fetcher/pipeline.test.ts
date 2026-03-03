import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NormalizedQuote } from '../../src/types/index.js';
import { processRoute } from '../../src/fetcher/pipeline.js';

vi.mock('../../src/fetcher/aggregators/index.js', () => ({
  fetchAllAggregators: vi.fn(),
}));
vi.mock('../../src/db/queries.js', () => ({
  insertQuotesBatch: vi.fn(),
  upsertRouteLatest: vi.fn(),
  updateRouteStatus: vi.fn(),
}));

const { fetchAllAggregators } = await import('../../src/fetcher/aggregators/index.js');
const { insertQuotesBatch, upsertRouteLatest, updateRouteStatus } = await import('../../src/db/queries.js');

function quote(overrides: Partial<NormalizedQuote>): NormalizedQuote {
  return {
    batchId: 'batch-1',
    ts: new Date(),
    srcChain: 'ethereum',
    dstChain: 'arbitrum',
    asset: 'USDC',
    amountTier: 1000,
    source: 'lifi',
    bridge: 'across',
    inputAmount: '1000000000',
    outputAmount: '999000000',
    inputUsd: '1000',
    outputUsd: '999',
    gasCostUsd: '0',
    protocolFeeBps: 10,
    totalFeeBps: 10,
    totalFeeUsd: '1',
    estimatedSeconds: 12,
    isMultihop: false,
    steps: 1,
    ...overrides,
  };
}

describe('processRoute', () => {
  beforeEach(() => {
    vi.mocked(fetchAllAggregators).mockResolvedValue({
      quotes: [quote({ outputUsd: '999' }), quote({ bridge: 'stargate', outputUsd: '998', source: 'rango' })],
      bridgesSeen: new Set(['across', 'stargate']),
    });
    vi.mocked(insertQuotesBatch).mockResolvedValue(2);
    vi.mocked(upsertRouteLatest).mockResolvedValue();
    vi.mocked(updateRouteStatus).mockResolvedValue();
  });

  it('calls insertQuotesBatch with ranked quotes', async () => {
    await processRoute('ethereum', 'arbitrum', 'USDC', 1000, 'batch-1');
    expect(insertQuotesBatch).toHaveBeenCalled();
    const calls = vi.mocked(insertQuotesBatch).mock.calls;
    expect(calls[0]![0].length).toBe(2);
    expect(calls[0]![0][0].batchId).toBe('batch-1');
  });

  it('calls upsertRouteLatest and updateRouteStatus', async () => {
    await processRoute('ethereum', 'arbitrum', 'USDC', 1000, 'batch-1');
    expect(upsertRouteLatest).toHaveBeenCalled();
    expect(updateRouteStatus).toHaveBeenCalledWith('ethereum', 'arbitrum', 'USDC', 1000, expect.any(Array));
  });
});
