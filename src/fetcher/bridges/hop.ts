import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken, isPlaceholder } from '../../config/tokens.js';
import { getChain } from '../../config/chains.js';
import { getFromAmountBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

/** Hop uses chain slugs matching their SDK. Map our slugs → Hop slugs. */
const HOP_CHAIN: Record<string, string> = {
  ethereum: 'ethereum',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  polygon: 'polygon',
  base: 'base',
  linea: 'linea',
  zksync: 'zksync',
};

/** Hop supported tokens */
const HOP_TOKENS = new Set(['ETH', 'USDC', 'USDT']);

export async function fetchHop(route: RouteKey): Promise<NormalizedQuote[]> {
  try {
    const fromChain = HOP_CHAIN[route.src];
    const toChain = HOP_CHAIN[route.dst];
    if (!fromChain || !toChain) return [];
    if (!HOP_TOKENS.has(route.asset)) return [];

    const srcToken = getToken(route.src, route.asset);
    const dstToken = getToken(route.dst, route.asset);
    if (isPlaceholder(srcToken) || isPlaceholder(dstToken)) return [];

    const amountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);

    const url = new URL('https://api.hop.exchange/v1/quote');
    url.searchParams.set('amount', amountBase);
    url.searchParams.set('token', route.asset === 'ETH' ? getChain(route.src).nativeToken : route.asset);
    url.searchParams.set('fromChain', fromChain);
    url.searchParams.set('toChain', toChain);
    url.searchParams.set('slippage', '50'); // 0.5%

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      amountOut?: string;
      totalFee?: string;
      estimatedReceivedFormatted?: string;
      bonderFeeFormatted?: string;
    };

    if (!data.amountOut) return [];

    const outputAmount = data.amountOut;
    const totalFee = data.totalFee ?? '0';
    const outputHuman = Number(outputAmount) / 10 ** dstToken.decimals;
    const outputUsd = route.asset === 'ETH'
      ? outputHuman * (route.amountTier / (Number(amountBase) / 10 ** srcToken.decimals))
      : outputHuman;
    const feeUsd = Number(totalFee) / 10 ** srcToken.decimals * (route.amountTier / (Number(amountBase) / 10 ** srcToken.decimals));
    const totalFeeBps = route.amountTier > 0 ? Math.round((10000 * (route.amountTier - outputUsd)) / route.amountTier) : 0;

    const quote: NormalizedQuote = {
      batchId: '',
      ts: new Date(),
      srcChain: route.src,
      dstChain: route.dst,
      asset: route.asset,
      amountTier: route.amountTier,
      source: 'direct',
      bridge: 'hop',
      inputAmount: amountBase,
      outputAmount,
      inputUsd: String(route.amountTier),
      outputUsd: String(outputUsd),
      gasCostUsd: '0',
      protocolFeeBps: totalFeeBps,
      totalFeeBps,
      totalFeeUsd: String(feeUsd),
      estimatedSeconds: 600, // Hop ~10min average
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    logger.debug({ route, error: e }, 'Hop fetch failed');
    return [];
  }
}
