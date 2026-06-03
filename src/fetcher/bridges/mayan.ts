import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken } from '../../config/tokens.js';
import { getFromAmountHuman, getFromAmountBase, humanToBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';
import { fetchWithTimeout } from '../../lib/utils.js';
import { RateLimitError } from '../../lib/errors.js';

export async function fetchMayan(route: RouteKey, _key: string): Promise<NormalizedQuote[]> {
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

    const res = await fetchWithTimeout(url, {}, 10_000);
    if (res.status === 429) throw new RateLimitError(Math.max(parseInt(res.headers.get('retry-after') ?? '0', 10) * 1000, 60_000));
    if (!res.ok) return [];

    const data = (await res.json()) as {
      effectiveAmountOut?: string;
      price?: number;
      eta?: number;
    };
    const outputAmount = data.effectiveAmountOut ?? '0';
    if (!outputAmount || outputAmount === '0') return [];

    const outputUsdNum = data.price != null ? route.amountTier * data.price : route.amountTier;
    // Mayan's `price` is the output/input USD ratio — fees are implicit in the spread.
    // Derive totalFeeUsd and totalFeeBps from (input - output) so ranking is correct.
    const totalFeeUsdNum = Math.max(0, route.amountTier - outputUsdNum);
    const totalFeeBps = route.amountTier > 0 ? Math.round((10000 * totalFeeUsdNum) / route.amountTier) : 0;

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
      outputUsd: String(outputUsdNum),
      gasCostUsd: '0',
      protocolFeeBps: totalFeeBps,
      totalFeeBps,
      totalFeeUsd: String(totalFeeUsdNum),
      estimatedSeconds: data.eta ?? 0,
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
    logger.debug({ route, error: e }, 'Mayan fetch failed');
    return [];
  }
}
