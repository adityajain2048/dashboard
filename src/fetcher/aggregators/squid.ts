import { z } from 'zod';
import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import type { Chain } from '../../types/index.js';
import { getToken, isPlaceholder } from '../../config/tokens.js';
import { getChain } from '../../config/chains.js';
import { getFromAmountBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';
import type { Asset } from '../../types/index.js';
import type { TokenEntry } from '../../types/index.js';

const SQUID_API_URL = 'https://v2.api.squidrouter.com/v2/route';

function getIntegratorId(): string {
  return process.env.SQUID_INTEGRATOR_ID ?? 'bridge-dashboard-ccf44383-88be-4758-8b61-a813f76e4';
}

// Chains confirmed NOT in Squid's chain list (checked against /v2/sdk-info)
const SQUID_UNSUPPORTED = new Set<string>([
  'zksync',    // chainId 324 — not in Squid
  'abstract',  // chainId 2741 — not in Squid
  'unichain',  // chainId 130 — not in Squid
  'megaeth',   // chainId 4326 — not in Squid
]);

// ─── Chain category detection ───

type SquidCategory = 'evm' | 'solana' | 'bitcoin' | 'cosmos' | 'sui';

function getSquidCategory(chain: Chain): SquidCategory | null {
  if (SQUID_UNSUPPORTED.has(chain.id)) return null;
  if (chain.id === 'solana') return 'solana';
  if (chain.id === 'bitcoin') return 'bitcoin';
  if (chain.id === 'sui') return 'sui';
  if (typeof chain.chainId === 'number') return 'evm';
  // Any remaining non-EVM with a string chainId = Cosmos IBC
  return 'cosmos';
}

// Squid chain ID (uses squidChainId override when set, otherwise chainId as string)
function getSquidChainId(chain: Chain): string {
  if (chain.squidChainId) return chain.squidChainId;
  return String(chain.chainId);
}

// Placeholder fromAddress/toAddress per chain category
const SQUID_PLACEHOLDER_ADDRESS: Record<SquidCategory, string> = {
  evm:     '0x000000000000000000000000000000000000dEaD',
  solana:  '5oNDL3swdJJF1g9DzJiZ4ynHXgszjAEpUkxVYejchzrY',
  bitcoin: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
  cosmos:  'cosmos1qnk2n4nlkpw9xfqntladh74er2xa62wac2d3u3',
  sui:     '0x0000000000000000000000000000000000000000000000000000000000000001',
};

// Squid-specific token address overrides for non-EVM chains
// Squid uses 0xEeee... for native on Solana, and "satoshi" for native BTC
function getSquidTokenAddress(chainId: string, asset: Asset, token: TokenEntry, cat: SquidCategory): string {
  if (cat === 'solana' && asset === 'ETH') return '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  if (cat === 'bitcoin' && asset === 'ETH') return 'satoshi';
  return token.address;
}

// ─── Bridge provider → canonical bridge ID ───
const SQUID_BRIDGE_MAP: Record<string, string> = {
  'Axelar':                        'axelar',
  'CCTP':                          'cctp',
  'Noble CCTP':                    'cctp',
  'Chainflip':                     'chainflip',
  'Squid Intents':                 'squid',
  'Squid':                         'squid',
  'IBC':                           'ibc',
  'IBC Packet forward middleware': 'ibc',
  'Immutable':                     'immutable',
};

function resolveBridge(provider: string): string {
  return SQUID_BRIDGE_MAP[provider] ?? provider.toLowerCase().replace(/\s+/g, '-');
}

// ─── Zod schemas (typed against @0xsquid/squid-types) ───

const SquidFeeCostSchema = z.object({
  amount:    z.string().optional().default('0'),
  amountUsd: z.string().optional().default('0'),
}).passthrough();

const SquidGasCostSchema = z.object({
  amount:    z.string().optional().default('0'),
  amountUsd: z.string().optional().default('0'),
}).passthrough();

const SquidActionSchema = z.object({
  type:     z.string(),
  provider: z.string().optional(),
  data: z.object({
    provider: z.string().optional(),
    name:     z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

const SquidEstimateSchema = z.object({
  fromAmount:             z.string(),
  toAmount:               z.string(),
  fromAmountUSD:          z.string().optional(),
  toAmountUSD:            z.string().optional(),
  estimatedRouteDuration: z.number().default(0),
  feeCosts:               z.array(SquidFeeCostSchema).default([]),
  gasCosts:               z.array(SquidGasCostSchema).default([]),
  actions:                z.array(SquidActionSchema).default([]),
}).passthrough();

const SquidRouteResponseSchema = z.object({
  route: z.object({
    estimate: SquidEstimateSchema,
    quoteId:  z.string().optional(),
  }).passthrough(),
});

// ─── Main fetcher ───

export async function fetchSquid(route: RouteKey): Promise<NormalizedQuote[]> {
  const srcChain = getChain(route.src);
  const dstChain = getChain(route.dst);

  const srcCat = getSquidCategory(srcChain);
  const dstCat = getSquidCategory(dstChain);
  if (!srcCat || !dstCat) return [];

  // Cosmos chains only support USDC/USDT (no ETH bridging via Squid IBC)
  if (route.asset === 'ETH' && (srcCat === 'cosmos' || dstCat === 'cosmos')) return [];

  // Sui has no USDC/USDT available via Squid currently — skip
  if (srcCat === 'sui' || dstCat === 'sui') return [];

  const srcToken = getToken(route.src, route.asset);
  const dstToken = getToken(route.dst, route.asset);
  if (isPlaceholder(srcToken) || isPlaceholder(dstToken)) return [];

  const fromAmountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);

  const body = {
    fromChain:   getSquidChainId(srcChain),
    toChain:     getSquidChainId(dstChain),
    fromToken:   getSquidTokenAddress(route.src, route.asset, srcToken, srcCat),
    toToken:     getSquidTokenAddress(route.dst, route.asset, dstToken, dstCat),
    fromAmount:  fromAmountBase,
    fromAddress: SQUID_PLACEHOLDER_ADDRESS[srcCat],
    toAddress:   SQUID_PLACEHOLDER_ADDRESS[dstCat],
    quoteOnly:   true,
    slippage:    1,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(SQUID_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-integrator-id': getIntegratorId(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    // 400/404 = no route for this pair
    if (res.status === 400 || res.status === 404) return [];
    // Squid returns 500 for thin-liquidity routes ("Low liquidity") — treat as no-route
    if (res.status === 500) {
      const lower = errBody.toLowerCase();
      if (lower.includes('liquidity') || lower.includes('no route') || lower.includes('insufficient')) {
        return [];
      }
    }
    throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 120)}`);
  }

  const raw = await res.json();
  const parsed = SquidRouteResponseSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn({ route, error: parsed.error.message.slice(0, 200) }, 'Squid route validation failed');
    return [];
  }

  const est = parsed.data.route.estimate;

  // Bridge name: first bridge/rfq/squid-send/ibc-transfer action
  const BRIDGE_TYPES = new Set(['bridge', 'rfq', 'squid-send', 'ibc-transfer']);
  const bridgeAction = est.actions.find((a) => BRIDGE_TYPES.has(a.type));
  const rawProvider =
    bridgeAction?.data?.provider ??
    bridgeAction?.data?.name ??
    bridgeAction?.provider ??
    'squid';
  const bridge = resolveBridge(rawProvider);

  // Fees
  const feeCostUsd = est.feeCosts.reduce((s, f) => s + Number(f.amountUsd || 0), 0);
  const gasCostUsd = est.gasCosts.reduce((s, g) => s + Number(g.amountUsd || 0), 0);
  const inputUsd   = Number(est.fromAmountUSD ?? route.amountTier);
  const outputUsd  = Number(est.toAmountUSD ?? 0);
  const totalFeeUsd   = Math.max(0, inputUsd - outputUsd);
  const totalFeeBps   = inputUsd > 0 ? Math.round((10000 * totalFeeUsd) / inputUsd) : 0;
  const protocolFeeBps = inputUsd > 0 ? Math.round((10000 * feeCostUsd) / inputUsd) : 0;

  const quote: NormalizedQuote = {
    batchId:        '',
    ts:             new Date(),
    srcChain:       route.src,
    dstChain:       route.dst,
    asset:          route.asset,
    amountTier:     route.amountTier,
    source:         'squid',
    bridge,
    inputAmount:    est.fromAmount,
    outputAmount:   est.toAmount,
    inputUsd:       String(inputUsd),
    outputUsd:      String(outputUsd),
    gasCostUsd:     String(gasCostUsd),
    protocolFeeBps,
    totalFeeBps,
    totalFeeUsd:    String(totalFeeUsd),
    estimatedSeconds: est.estimatedRouteDuration,
    isMultihop:     est.actions.length > 1,
    steps:          est.actions.length,
  };

  return [quote];
}
