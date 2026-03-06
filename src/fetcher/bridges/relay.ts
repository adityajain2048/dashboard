import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getChain } from '../../config/chains.js';
import { getToken } from '../../config/tokens.js';
import { getFromAmountHuman, getFromAmountBase, humanToBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

export async function fetchRelay(route: RouteKey): Promise<NormalizedQuote[]> {
  try {
    const srcChain = getChain(route.src);
    const dstChain = getChain(route.dst);
    const fromChainId = typeof srcChain.chainId === 'number' ? srcChain.chainId : null;
    const toChainId = typeof dstChain.chainId === 'number' ? dstChain.chainId : null;
    if (fromChainId === null || toChainId === null) return [];
    const srcToken = getToken(route.src, route.asset);
    const dstToken = getToken(route.dst, route.asset);
    const inputAmountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);

    const body = {
      user: '0x0000000000000000000000000000000000000000',
      originChainId: fromChainId,
      destinationChainId: toChainId,
      originCurrency: route.asset,
      destinationCurrency: route.asset,
      amount: getFromAmountHuman(route.amountTier, route.asset, route.src),
      tradeType: 'EXACT_INPUT',
    };

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch('https://api.relay.link/quote', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    clearTimeout(t);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      details?: {
        currencyOut?: { amountFormatted?: string; amountUsd?: number };
        totalFee?: { amountUsd?: number };
        timeEstimate?: number;
      };
    };
    const out = data.details?.currencyOut;
    const fee = data.details?.totalFee?.amountUsd ?? 0;
    const outputUsd = out?.amountUsd ?? route.amountTier - fee;
    const quote: NormalizedQuote = {
      batchId: '',
      ts: new Date(),
      srcChain: route.src,
      dstChain: route.dst,
      asset: route.asset,
      amountTier: route.amountTier,
      source: 'direct',
      bridge: 'relay',
      inputAmount: inputAmountBase,
      outputAmount: out?.amountFormatted
        ? humanToBase(out.amountFormatted, dstToken.decimals)
        : getFromAmountBase(outputUsd, route.asset, dstToken.decimals, route.dst),
      inputUsd: String(route.amountTier),
      outputUsd: String(outputUsd),
      gasCostUsd: '0',
      protocolFeeBps: route.amountTier > 0 ? Math.round((10000 * fee) / route.amountTier) : 0,
      totalFeeBps: route.amountTier > 0 ? Math.round((10000 * fee) / route.amountTier) : 0,
      totalFeeUsd: String(fee),
      estimatedSeconds: data.details?.timeEstimate ?? 0,
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    logger.debug({ route, error: e }, 'Relay fetch failed');
    return [];
  }
}
