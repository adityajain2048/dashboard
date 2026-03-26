import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken, isPlaceholder } from '../../config/tokens.js';
import { getChain } from '../../config/chains.js';
import { getFromAmountBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

/** Orbiter uses EVM chain IDs directly */
const ORBITER_SUPPORTED = new Set([
  'ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc',
  'linea', 'zksync', 'scroll', 'mantle',
]);

export async function fetchOrbiter(route: RouteKey): Promise<NormalizedQuote[]> {
  try {
    if (!ORBITER_SUPPORTED.has(route.src) || !ORBITER_SUPPORTED.has(route.dst)) return [];

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

    const body = {
      srcChainId: String(fromChainId),
      dstChainId: String(toChainId),
      srcTokenAddress: srcToken.address,
      dstTokenAddress: dstToken.address,
      amount: amountBase,
    };

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch('https://openapi.orbiter.finance/sdk/routers/quote', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    clearTimeout(t);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      data?: {
        dstAmount?: string;
        tradeFee?: string;
        withholdingFee?: string;
      };
      status?: string;
    };

    if (!data.data?.dstAmount) return [];

    const outputAmount = data.data.dstAmount;
    const outputHuman = Number(outputAmount) / 10 ** dstToken.decimals;
    const inputHuman = Number(amountBase) / 10 ** srcToken.decimals;
    const priceRatio = route.amountTier / inputHuman;
    const outputUsd = route.asset === 'ETH' ? outputHuman * priceRatio : outputHuman;
    const totalFeeBps = route.amountTier > 0 ? Math.round((10000 * (route.amountTier - outputUsd)) / route.amountTier) : 0;

    const quote: NormalizedQuote = {
      batchId: '',
      ts: new Date(),
      srcChain: route.src,
      dstChain: route.dst,
      asset: route.asset,
      amountTier: route.amountTier,
      source: 'direct',
      bridge: 'orbiter',
      inputAmount: amountBase,
      outputAmount,
      inputUsd: String(route.amountTier),
      outputUsd: String(outputUsd),
      gasCostUsd: '0',
      protocolFeeBps: totalFeeBps,
      totalFeeBps,
      totalFeeUsd: String(Math.max(0, route.amountTier - outputUsd)),
      estimatedSeconds: 30, // Orbiter is fast ~30s
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    logger.debug({ route, error: e }, 'Orbiter fetch failed');
    return [];
  }
}
