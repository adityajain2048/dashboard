import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken } from '../../config/tokens.js';
import { getFromAmountHuman, getFromAmountBase, humanToBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

export async function fetchMayan(route: RouteKey): Promise<NormalizedQuote[]> {
  try {
    const srcToken = getToken(route.src, route.asset);
    const dstToken = getToken(route.dst, route.asset);
    const amountHuman = getFromAmountHuman(route.amountTier, route.asset, route.src);
    const inputAmountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);
    const url = new URL('https://price-api.mayan.finance/v3/quote');
    url.searchParams.set('amountIn', amountHuman);
    url.searchParams.set('fromToken', srcToken.address);
    url.searchParams.set('fromChain', route.src);
    url.searchParams.set('toToken', dstToken.address);
    url.searchParams.set('toChain', route.dst);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      effectiveAmountOut?: string;
      price?: number;
      eta?: number;
    };
    const outputAmount = data.effectiveAmountOut ?? '0';
    const outputUsd = data.price != null ? String(route.amountTier * data.price) : String(route.amountTier);
    const quote: NormalizedQuote = {
      batchId: '',
      ts: new Date(),
      srcChain: route.src,
      dstChain: route.dst,
      asset: route.asset,
      amountTier: route.amountTier,
      source: 'direct',
      bridge: 'mayan',
      inputAmount: inputAmountBase,
      outputAmount: humanToBase(outputAmount, dstToken.decimals),
      inputUsd: String(route.amountTier),
      outputUsd,
      gasCostUsd: '0',
      protocolFeeBps: 0,
      totalFeeBps: 0,
      totalFeeUsd: '0',
      estimatedSeconds: data.eta ?? 0,
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    logger.debug({ route, error: e }, 'Mayan fetch failed');
    return [];
  }
}
