import { z } from 'zod';
import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken, isPlaceholder } from '../../config/tokens.js';
import { getChain } from '../../config/chains.js';
import { resolveBridgeName } from '../../config/bridges.js';
import { getFromAmountBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

const LIFI_UNSUPPORTED = new Set<string>([]);

const LIFI_KEYS = [
  process.env.LIFI_API_KEY_1,
  process.env.LIFI_API_KEY_2,
  process.env.LIFI_API_KEY_3,
].filter(Boolean) as string[];

let lifiKeyIndex = 0;

/** Per-key ban tracking: key → timestamp when ban lifts */
const keyBanUntil = new Map<string, number>();

function banKey(key: string, retryAfterMs: number): void {
  keyBanUntil.set(key, Date.now() + retryAfterMs);
  const retryAfterMin = Math.ceil(retryAfterMs / 60_000);
  logger.warn({ keyPrefix: key.slice(0, 8), retryAfterMin }, 'LI.FI key rate-limited — cooling down');
}

/**
 * Returns the next non-banned key using round-robin.
 * Returns '' if ALL keys are currently banned — callers should skip LI.FI entirely.
 */
function getNextLifiKey(): string {
  if (LIFI_KEYS.length === 0) return '';
  const now = Date.now();
  // Try each key once starting from current index; skip banned ones
  for (let attempt = 0; attempt < LIFI_KEYS.length; attempt++) {
    const idx = lifiKeyIndex % LIFI_KEYS.length;
    lifiKeyIndex++;
    const key = LIFI_KEYS[idx]!;
    if ((keyBanUntil.get(key) ?? 0) <= now) {
      return key;
    }
  }
  // All keys are banned
  const soonestUnban = Math.min(...LIFI_KEYS.map((k) => keyBanUntil.get(k) ?? 0));
  const secsLeft = Math.ceil((soonestUnban - now) / 1000);
  logger.warn({ secsLeft }, 'All LI.FI keys rate-limited — skipping LI.FI this cycle');
  return '';
}

/** Resolve bridge for display: use canonical id if mapped, else raw tool key (so we keep all routes). */
function bridgeId(toolKey: string): string {
  return resolveBridgeName('lifi', toolKey) ?? toolKey.toLowerCase();
}

// ─── Advanced routes response (multiple routes per request) ───
const LifiStepEstimateSchema = z.object({
  fromAmount: z.string().optional(),
  toAmount: z.string().optional(),
  toAmountUSD: z.string().optional(),
  executionDuration: z.number().optional(),
  feeCosts: z.array(z.object({ amountUSD: z.string().optional() })).optional().default([]),
  gasCosts: z.array(z.object({ amountUSD: z.string().optional() })).optional().default([]),
}).passthrough();

const LifiStepSchema = z.object({
  type: z.enum(['swap', 'cross', 'lifi', 'protocol']),
  tool: z.string(),
  toolDetails: z.object({ key: z.string(), name: z.string().optional() }).optional(),
  estimate: LifiStepEstimateSchema.optional(),
}).passthrough();

const LifiRouteSchema = z.object({
  id: z.string().optional(),
  fromChainId: z.number(),
  toChainId: z.number(),
  fromAmount: z.string(),
  fromAmountUSD: z.string().optional().default('0'),
  toAmount: z.string(),
  toAmountUSD: z.string().optional().default('0'),
  toAmountMin: z.string().optional(),
  gasCostUSD: z.string().optional().default('0'),
  steps: z.array(LifiStepSchema),
}).passthrough();

const LifiAdvancedRoutesResponseSchema = z.object({
  routes: z.array(LifiRouteSchema),
  // LI.FI returns unavailableRoutes as an object {filteredOut:[...]} not an array
  unavailableRoutes: z.unknown().optional(),
}).passthrough();

export async function fetchLifi(route: RouteKey): Promise<NormalizedQuote[]> {
  if (LIFI_UNSUPPORTED.has(route.src) || LIFI_UNSUPPORTED.has(route.dst)) {
    return [];
  }

  const srcToken = getToken(route.src, route.asset);

  const dstToken = getToken(route.dst, route.asset);
  if (isPlaceholder(srcToken) || isPlaceholder(dstToken)) return [];

  const srcChain = getChain(route.src);
  const dstChain = getChain(route.dst);
  const fromAmountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);

  const fromChainId = srcChain.lifiChainId ?? (typeof srcChain.chainId === 'number' ? srcChain.chainId : Number.NaN);
  const toChainId = dstChain.lifiChainId ?? (typeof dstChain.chainId === 'number' ? dstChain.chainId : Number.NaN);
  if (Number.isNaN(fromChainId) || Number.isNaN(toChainId)) return [];

  // LI.FI expects "bitcoin" for BTC token; we use "native" in tokens config
  const fromTokenAddr = route.src === 'bitcoin' && route.asset === 'ETH' ? 'bitcoin' : srcToken.address;
  const toTokenAddr = route.dst === 'bitcoin' && route.asset === 'ETH' ? 'bitcoin' : dstToken.address;

  // LI.FI expects address format matching source chain (EVM 0x, Solana base58, Bitcoin bech32)
  const EVM_PLACEHOLDER = '0x000000000000000000000000000000000000dEaD';
  const SOLANA_PLACEHOLDER = '5oNDL3swdJJF1g9DzJiZ4ynHXgszjAEpUkxVYejchzrY';
  const BITCOIN_PLACEHOLDER = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
  const fromAddress = route.src === 'solana' ? SOLANA_PLACEHOLDER
    : route.src === 'bitcoin' ? BITCOIN_PLACEHOLDER
    : EVM_PLACEHOLDER;

  const apiKey = getNextLifiKey();
  if (!apiKey) return []; // all keys are rate-limited; skip silently

  const body = {
    fromChainId,
    toChainId,
    fromTokenAddress: fromTokenAddr,
    toTokenAddress: toTokenAddr,
    fromAmount: fromAmountBase,
    fromAddress,
    options: { order: 'CHEAPEST' as const },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch('https://li.quest/v1/advanced/routes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-lifi-api-key': apiKey } : {}),
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
    if (res.status === 404) return [];
    if (res.status === 429) {
      // Parse retry delay from message, e.g. "retry in 40 minutes" — default 40 min
      const match = errBody.match(/retry in (\d+) minute/i);
      const retryAfterMs = match ? parseInt(match[1], 10) * 60_000 : 40 * 60_000;
      banKey(apiKey, retryAfterMs);
      return []; // don't throw — let Squid/Bungee/Rango cover this route
    }
    throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 100)}`);
  }

  const raw = await res.json();
  const parsed = LifiAdvancedRoutesResponseSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn({ route, error: parsed.error.message.slice(0, 200) }, 'LI.FI advanced/routes validation failed');
    return [];
  }

  const routes = parsed.data.routes;
  if (!routes.length) return [];

  const ts = new Date();
  const quotes: NormalizedQuote[] = [];

  for (const r of routes) {
    // Primary bridge = tool of the cross/lifi step (the actual bridge step)
    const crossStep = r.steps.find((s) => s.type === 'cross' || s.type === 'lifi');
    const toolKey = crossStep?.toolDetails?.key ?? crossStep?.tool ?? '';
    const bridge = bridgeId(toolKey);
    if (!toolKey) continue;

    const fromUsd = Number(r.fromAmountUSD ?? 0);
    const toUsd = Number(r.toAmountUSD ?? 0);
    const gasUsd = Number(r.gasCostUSD ?? 0);
    const feeUsd = Math.max(0, fromUsd - toUsd - gasUsd);
    const totalFeeUsd = fromUsd > 0 ? Math.max(0, fromUsd - toUsd) : 0;
    const totalFeeBps = fromUsd > 0 ? Math.round((10000 * totalFeeUsd) / fromUsd) : 0;
    const protocolFeeBps = fromUsd > 0 ? Math.round((10000 * feeUsd) / fromUsd) : 0;

    let estimatedSeconds = 0;
    for (const step of r.steps) {
      const est = step.estimate;
      if (est?.executionDuration != null) estimatedSeconds += est.executionDuration;
    }

    quotes.push({
      batchId: '',
      ts,
      srcChain: route.src,
      dstChain: route.dst,
      asset: route.asset,
      amountTier: route.amountTier,
      source: 'lifi',
      bridge,
      inputAmount: r.fromAmount,
      outputAmount: r.toAmount,
      inputUsd: r.fromAmountUSD ?? '0',
      outputUsd: r.toAmountUSD ?? '0',
      gasCostUsd: String(gasUsd),
      protocolFeeBps,
      totalFeeBps,
      totalFeeUsd: String(totalFeeUsd),
      estimatedSeconds,
      isMultihop: r.steps.length > 1,
      steps: r.steps.length,
    });
  }

  return quotes;
}
