import { z } from 'zod';
import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken, isPlaceholder } from '../../config/tokens.js';
import { getChain } from '../../config/chains.js';
import { resolveBridgeName } from '../../config/bridges.js';
import { getFromAmountBase, outputAmountToUsd } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

const BUNGEE_UNSUPPORTED = new Set<string>([
  'solana',
  'bitcoin',
]);

const BungeeSchema = z.object({
  success: z.boolean(),
  result: z.object({
    routes: z.array(z.object({
      usedBridgeNames: z.array(z.string()),
      toAmount: z.string(),
      totalGasFeesInUsd: z.number().optional(),
      serviceTime: z.number().optional(),
      inputValueInUsd: z.number().optional(),
      outputValueInUsd: z.number().optional(),
    })),
  }).optional(),
});

export async function fetchBungee(route: RouteKey): Promise<NormalizedQuote[]> {
  const srcChain = getChain(route.src);
  const dstChain = getChain(route.dst);
  if (srcChain.type === 'non-evm' || dstChain.type === 'non-evm') return [];
  if (BUNGEE_UNSUPPORTED.has(route.src) || BUNGEE_UNSUPPORTED.has(route.dst)) return [];

  const srcToken = getToken(route.src, route.asset);
  const dstToken = getToken(route.dst, route.asset);
  if (isPlaceholder(srcToken) || isPlaceholder(dstToken)) return [];

  const fromChainId = srcChain.bungeeChainId ?? (typeof srcChain.chainId === 'number' ? srcChain.chainId : undefined);
  const toChainId = dstChain.bungeeChainId ?? (typeof dstChain.chainId === 'number' ? dstChain.chainId : undefined);
  if (fromChainId === undefined || toChainId === undefined) return [];

  const fromAmountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);
  const apiKey = process.env.BUNGEE_API_KEY ?? '';

  const url = new URL('https://api.socket.tech/v2/quote');
  url.searchParams.set('fromChainId', String(fromChainId));
  url.searchParams.set('toChainId', String(toChainId));
  url.searchParams.set('fromTokenAddress', srcToken.address);
  url.searchParams.set('toTokenAddress', dstToken.address);
  url.searchParams.set('fromAmount', fromAmountBase);
  url.searchParams.set('userAddress', '0x0000000000000000000000000000000000000000');
  url.searchParams.set('sort', 'output');
  url.searchParams.set('singleTxOnly', 'true');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: apiKey ? { 'API-KEY': apiKey } : {},
    });
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 100)}`);
  }

  const raw = await res.json();
  const parsed = BungeeSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.result?.routes?.length) {
    if (parsed.success && parsed.data.result?.routes?.length === 0) return [];
    logger.debug({ route }, 'Bungee response invalid');
    return [];
  }

  const quotes: NormalizedQuote[] = [];
  const ts = new Date();
  for (const r of parsed.data.result.routes) {
    const bridgeName = r.usedBridgeNames?.[0] ?? '';
    const bridge = resolveBridgeName('bungee', bridgeName) ?? bridgeName.toLowerCase();
    if (!bridge) continue;

    const gasUsd = r.totalGasFeesInUsd ?? 0;
    // Prefer Socket's outputValueInUsd when in sane range — matches bridge's implied rate (e.g. Symbiosis ETH→AVAX)
    // Fall back to our computation when Socket's value is wrong (BNB, etc. decimal bugs) or missing
    const computedUsd = outputAmountToUsd(r.toAmount, dstToken.decimals, route.asset, route.dst);
    const socketUsd = r.outputValueInUsd ?? 0;
    const inputUsd = route.amountTier;
    const outputUsd =
      socketUsd > 0 && socketUsd >= inputUsd * 0.5 && socketUsd <= inputUsd * 1.5
        ? socketUsd
        : computedUsd;
    const totalFeeBps =
      route.amountTier > 0
        ? Math.round((10000 * (route.amountTier - outputUsd)) / route.amountTier)
        : 0;

    quotes.push({
      batchId: '',
      ts,
      srcChain: route.src,
      dstChain: route.dst,
      asset: route.asset,
      amountTier: route.amountTier,
      source: 'bungee',
      bridge,
      inputAmount: fromAmountBase,
      outputAmount: r.toAmount,
      inputUsd: String(route.amountTier),
      outputUsd: String(outputUsd),
      gasCostUsd: String(gasUsd),
      protocolFeeBps: totalFeeBps,
      totalFeeBps,
      totalFeeUsd: String(Math.max(0, route.amountTier - outputUsd)),
      estimatedSeconds: r.serviceTime ?? 0,
      isMultihop: false,
      steps: 1,
    });
  }
  return quotes;
}

