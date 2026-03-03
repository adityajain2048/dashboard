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
function getNextLifiKey(): string {
  if (LIFI_KEYS.length === 0) return '';
  const key = LIFI_KEYS[lifiKeyIndex % LIFI_KEYS.length]!;
  lifiKeyIndex++;
  return key;
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

  // LI.FI expects address format matching source chain (EVM 0x, Solana base58)
  const EVM_PLACEHOLDER = '0x000000000000000000000000000000000000dEaD';
  const SOLANA_PLACEHOLDER = '5oNDL3swdJJF1g9DzJiZ4ynHXgszjAEpUkxVYejchzrY';
  const fromAddress = route.src === 'solana' ? SOLANA_PLACEHOLDER : EVM_PLACEHOLDER;

  const apiKey = getNextLifiKey();
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
