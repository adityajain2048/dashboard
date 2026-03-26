import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken, isPlaceholder } from '../../config/tokens.js';
import { getChain } from '../../config/chains.js';
import { getFromAmountBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

/** Everclear (ex-Connext) supported chains — EVM only, major L1s+L2s */
const EVERCLEAR_SUPPORTED = new Set([
  'ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc',
  'linea', 'mantle',
]);

export async function fetchEverclear(route: RouteKey): Promise<NormalizedQuote[]> {
  try {
    if (!EVERCLEAR_SUPPORTED.has(route.src) || !EVERCLEAR_SUPPORTED.has(route.dst)) return [];
    // Everclear primarily supports stablecoins
    if (route.asset === 'ETH') return [];

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
      originDomain: String(fromChainId),
      destinationDomain: String(toChainId),
      originTokenAddress: srcToken.address,
      amount: amountBase,
    };

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch('https://api.everclear.org/intents/quote', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    clearTimeout(t);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      amountReceived?: string;
      fee?: string;
      estimatedTime?: number;
    };

    if (!data.amountReceived) return [];

    const outputAmount = data.amountReceived;
    const outputHuman = Number(outputAmount) / 10 ** dstToken.decimals;
    const outputUsd = outputHuman; // stablecoins only
    const totalFeeBps = route.amountTier > 0 ? Math.round((10000 * (route.amountTier - outputUsd)) / route.amountTier) : 0;

    const quote: NormalizedQuote = {
      batchId: '',
      ts: new Date(),
      srcChain: route.src,
      dstChain: route.dst,
      asset: route.asset,
      amountTier: route.amountTier,
      source: 'direct',
      bridge: 'everclear',
      inputAmount: amountBase,
      outputAmount,
      inputUsd: String(route.amountTier),
      outputUsd: String(outputUsd),
      gasCostUsd: '0',
      protocolFeeBps: totalFeeBps,
      totalFeeBps,
      totalFeeUsd: String(Math.max(0, route.amountTier - outputUsd)),
      estimatedSeconds: data.estimatedTime ?? 1800, // Everclear can be slow (auction-based)
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    logger.debug({ route, error: e }, 'Everclear fetch failed');
    return [];
  }
}
