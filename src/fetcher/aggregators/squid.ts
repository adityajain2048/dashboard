import { z } from 'zod';
import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import type { Chain } from '../../types/index.js';
import { getToken, isPlaceholder } from '../../config/tokens.js';
import { getChain } from '../../config/chains.js';
import { getFromAmountBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';
import { fetchWithTimeout } from '../../lib/utils.js';
import type { Asset } from '../../types/index.js';
import type { TokenEntry } from '../../types/index.js';

const SQUID_API_URL = 'https://v2.api.squidrouter.com/v2/route';

function getIntegratorId(): string {
  return process.env.SQUID_INTEGRATOR_ID ?? 'bridge-dashboard-ccf44383-88be-4758-8b61-a813f76e4';
}

/** Squid global 429 cooldown — one integrator ID, so one shared backoff */
let squidBannedUntil = 0;

function setSquidCooldown(retryAfterMs: number): void {
  squidBannedUntil = Date.now() + retryAfterMs;
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  logger.warn({ retryAfterSec }, 'Squid rate-limited — cooling down');
}

function isSquidBanned(): boolean {
  return Date.now() < squidBannedUntil;
}

// Chains confirmed NOT supported by Squid (verified against GET /v2/chains 2026-06-02).
// Any chain whose chainId does not appear in Squid's chain list should be listed here
// so we skip the API call and avoid accumulating false no_route misses for adaptive skip.
const SQUID_UNSUPPORTED = new Set<string>([
  'zksync',    // chainId 324 — not in Squid chain list
  'abstract',  // chainId 2741 — not in Squid chain list
  'unichain',  // chainId 130 — not in Squid chain list
  'megaeth',   // chainId 4326 — not in Squid chain list
  // Note: monad (143), hyperliquid/HyperEVM (999), berachain (80094),
  //       sonic (146), soneium (1868) ARE in Squid's chain list.
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

// Placeholder fromAddress/toAddress per chain category (EVM/non-Cosmos)
const SQUID_PLACEHOLDER_ADDRESS: Record<Exclude<SquidCategory, 'cosmos'>, string> = {
  evm:     '0x000000000000000000000000000000000000dEaD',
  solana:  '5oNDL3swdJJF1g9DzJiZ4ynHXgszjAEpUkxVYejchzrY',
  bitcoin: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
  sui:     '0x0000000000000000000000000000000000000000000000000000000000000001',
};

/**
 * Squid validates bech32 prefix against each Cosmos chain's expected HRP.
 * A generic `cosmos1…` placeholder is rejected for all chains except Cosmos Hub.
 * These addresses are derived from the same 32-byte key as the cosmos1 placeholder,
 * re-encoded with each chain's bech32 HRP.
 */
const COSMOS_PLACEHOLDER: Record<string, string> = {
  osmosis:     'osmo1qnk2n4nlkpw9xfqntladh74er2xa62war2wzrp',
  cosmoshub:   'cosmos1qnk2n4nlkpw9xfqntladh74er2xa62wac2d3u3',
  neutron:     'neutron1qnk2n4nlkpw9xfqntladh74er2xa62wa0w5s05',
  dydx:        'dydx1qnk2n4nlkpw9xfqntladh74er2xa62wazgnk4y',
  sei:         'sei1qnk2n4nlkpw9xfqntladh74er2xa62waxavynj',
  injective:   'inj1qnk2n4nlkpw9xfqntladh74er2xa62wapc2k8t',
  celestia:    'celestia1qnk2n4nlkpw9xfqntladh74er2xa62wa6mvz07',
  axelar:      'axelar1qnk2n4nlkpw9xfqntladh74er2xa62wa0lt67j',
  kujira:      'kujira1qnk2n4nlkpw9xfqntladh74er2xa62wa6el2ce',
  terra:       'terra1qnk2n4nlkpw9xfqntladh74er2xa62wad48jhn',
  dymension:   'dym1qnk2n4nlkpw9xfqntladh74er2xa62waev35sa',
  stargaze:    'stars1qnk2n4nlkpw9xfqntladh74er2xa62wald207z',
  akash:       'akash1qnk2n4nlkpw9xfqntladh74er2xa62wax2s4vf',
  stride:      'stride1qnk2n4nlkpw9xfqntladh74er2xa62wag6awpl',
  juno:        'juno1qnk2n4nlkpw9xfqntladh74er2xa62waar7fj0',
  noble:       'noble1qnk2n4nlkpw9xfqntladh74er2xa62warjg6da',
  persistence: 'persistence1qnk2n4nlkpw9xfqntladh74er2xa62wa9ampmh',
  agoric:      'agoric1qnk2n4nlkpw9xfqntladh74er2xa62waevld99',
  archway:     'archway1qnk2n4nlkpw9xfqntladh74er2xa62wa76pkly',
  xion:        'xion1qnk2n4nlkpw9xfqntladh74er2xa62wafc8src',
  elys:        'elys1qnk2n4nlkpw9xfqntladh74er2xa62wat3y4c3',
  saga:        'saga1qnk2n4nlkpw9xfqntladh74er2xa62wa4zyqj4',
  migaloo:     'migaloo1qnk2n4nlkpw9xfqntladh74er2xa62wax95gqa',
};

function getCosmosPlaceholder(chainId: string): string {
  return COSMOS_PLACEHOLDER[chainId] ?? 'cosmos1qnk2n4nlkpw9xfqntladh74er2xa62wac2d3u3';
}

// Squid-specific token address overrides for non-EVM chains
// Squid v2 uses 0xeee...eee as the native-token sentinel on ALL chains, including Solana.
// Our tokens.ts stores So111... (wSOL SPL mint) which is correct for LI.FI/Bungee/Rango
// but Squid rejects it and returns "Low liquidity" — the correct address for Squid is the
// universal native-token sentinel it uses across EVM and non-EVM alike.
// For Bitcoin: Squid uses "satoshi" as the native token identifier.
function getSquidTokenAddress(_chainId: string, asset: Asset, token: TokenEntry, cat: SquidCategory): string {
  if (cat === 'bitcoin' && asset === 'ETH') return 'satoshi';
  if (cat === 'solana' && asset === 'ETH') return '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
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
  if (isSquidBanned()) return []; // cooling down — skip silently

  const srcChain = getChain(route.src);
  const dstChain = getChain(route.dst);

  const srcCat = getSquidCategory(srcChain);
  const dstCat = getSquidCategory(dstChain);
  if (!srcCat || !dstCat) return [];

  // Cosmos ETH = native chain token (OSMO, ATOM, SEI, etc.) — handled via getSquidTokenAddress
  // which returns the IBC denom from tokens.ts (e.g. "uosmo"). Squid bridges via Axelar+swap.

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
    fromAddress: srcCat === 'cosmos' ? getCosmosPlaceholder(route.src) : SQUID_PLACEHOLDER_ADDRESS[srcCat],
    toAddress:   dstCat === 'cosmos' ? getCosmosPlaceholder(route.dst) : SQUID_PLACEHOLDER_ADDRESS[dstCat],
    quoteOnly:   true,
    slippage:    1,
  };

  const res = await fetchWithTimeout(SQUID_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integrator-id': getIntegratorId(),
    },
    body: JSON.stringify(body),
  }, 10_000);

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    // 400/404 = no route for this pair
    if (res.status === 400 || res.status === 404) {
      // Log maintenance/explicit errors at debug level so we can diagnose
      const lower = errBody.toLowerCase();
      if (lower.includes('maintenance') || lower.includes('not supported')) {
        logger.debug(
          { route, status: res.status, body: errBody.slice(0, 200) },
          'Squid: chain/route not supported or under maintenance'
        );
      }
      return [];
    }
    // 429 = rate limited — back off and skip silently
    if (res.status === 429) {
      // Honour Retry-After header but enforce a 60s minimum to prevent rapid re-bans.
      const retryHeader = res.headers.get('retry-after');
      const headerMs = retryHeader ? parseInt(retryHeader, 10) * 1000 : 0;
      const retryAfterMs = Math.max(headerMs, 60_000);
      setSquidCooldown(retryAfterMs);
      return [];
    }
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

  // Sanity: reject quotes where output is > 2× input. This catches Squid price-feed
  // bugs on low-value Cosmos tokens (e.g. STARS) where toAmountUSD is wildly inflated.
  // Legitimate routes with favourable rates stay within ~30% of input.
  if (outputUsd > inputUsd * 2 && outputUsd > 10) {
    logger.debug(
      { route, inputUsd, outputUsd, bridge },
      'Squid: output > 2× input — likely price-feed error, skipping'
    );
    return [];
  }

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
