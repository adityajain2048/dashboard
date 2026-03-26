import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken, isPlaceholder } from '../../config/tokens.js';
import { getChain } from '../../config/chains.js';
import { getFromAmountBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

export async function fetchDebridge(route: RouteKey): Promise<NormalizedQuote[]> {
  try {
    const srcChain = getChain(route.src);
    const dstChain = getChain(route.dst);
    if (srcChain.type === 'non-evm' || dstChain.type === 'non-evm') return [];

    const srcToken = getToken(route.src, route.asset);
    const dstToken = getToken(route.dst, route.asset);
    if (isPlaceholder(srcToken) || isPlaceholder(dstToken)) return [];

    const fromChainId = typeof srcChain.chainId === 'number' ? srcChain.chainId : null;
    const toChainId = typeof dstChain.chainId === 'number' ? dstChain.chainId : null;
    if (fromChainId === null || toChainId === null) return [];

    const amountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);

    const url = new URL('https://deswap.debridge.finance/v1.0/dln/order/quote');
    url.searchParams.set('srcChainId', String(fromChainId));
    url.searchParams.set('srcChainTokenIn', srcToken.address);
    url.searchParams.set('dstChainId', String(toChainId));
    url.searchParams.set('dstChainTokenOut', dstToken.address);
    url.searchParams.set('srcChainTokenInAmount', amountBase);
    url.searchParams.set('prependOperatingExpenses', 'true');

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      estimation?: {
        dstChainTokenOut?: { amount?: string; recommendedAmount?: string; maxTheoreticalAmount?: string };
        srcChainTokenIn?: { amount?: string };
        costsDetails?: Array<{ chain?: string; tokenIn?: string; amountInUsd?: string; type?: string }>;
      };
      order?: { approximateFulfillmentDelay?: number };
    };

    const est = data.estimation;
    if (!est?.dstChainTokenOut?.amount) return [];

    const outputAmount = est.dstChainTokenOut.recommendedAmount ?? est.dstChainTokenOut.amount;
    const inputAmountActual = est.srcChainTokenIn?.amount ?? amountBase;

    // Sum costs for fee calculation
    let totalCostUsd = 0;
    for (const cost of est.costsDetails ?? []) {
      totalCostUsd += parseFloat(cost.amountInUsd ?? '0');
    }

    const outputHuman = Number(outputAmount) / 10 ** dstToken.decimals;
    const inputHuman = Number(inputAmountActual) / 10 ** srcToken.decimals;
    const outputUsd = route.asset === 'ETH' ? outputHuman * (route.amountTier / inputHuman) : outputHuman;
    const totalFeeBps = route.amountTier > 0 ? Math.round((10000 * (route.amountTier - outputUsd)) / route.amountTier) : 0;

    const quote: NormalizedQuote = {
      batchId: '',
      ts: new Date(),
      srcChain: route.src,
      dstChain: route.dst,
      asset: route.asset,
      amountTier: route.amountTier,
      source: 'direct',
      bridge: 'debridge',
      inputAmount: amountBase,
      outputAmount,
      inputUsd: String(route.amountTier),
      outputUsd: String(outputUsd),
      gasCostUsd: '0',
      protocolFeeBps: totalFeeBps,
      totalFeeBps,
      totalFeeUsd: String(totalCostUsd),
      estimatedSeconds: data.order?.approximateFulfillmentDelay ?? 0,
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    logger.debug({ route, error: e }, 'deBridge fetch failed');
    return [];
  }
}
