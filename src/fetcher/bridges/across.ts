import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken } from '../../config/tokens.js';
import { getChain } from '../../config/chains.js';
import { getFromAmountBase, outputAmountToUsd } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

export async function fetchAcross(route: RouteKey): Promise<NormalizedQuote[]> {
  try {
    const srcChain = getChain(route.src);
    const dstChain = getChain(route.dst);
    if (srcChain.type === 'non-evm' || dstChain.type === 'non-evm') return [];

    const srcToken = getToken(route.src, route.asset);
    const dstToken = getToken(route.dst, route.asset);
    const fromChainId = typeof srcChain.chainId === 'number' ? srcChain.chainId : null;
    const toChainId = typeof dstChain.chainId === 'number' ? dstChain.chainId : null;
    if (fromChainId === null || toChainId === null) return [];

    const amountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);
    const url = new URL('https://app.across.to/api/suggested-fees');
    url.searchParams.set('token', srcToken.address);
    url.searchParams.set('destinationChainId', String(toChainId));
    url.searchParams.set('originChainId', String(fromChainId));
    url.searchParams.set('amount', amountBase);
    url.searchParams.set('skipAmountLimit', 'true');

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return [];

    const data = (await res.json()) as { totalRelayFee?: { total?: string; pct?: string }; estimatedFillTimeSec?: number };
    const totalRelayFee = data.totalRelayFee?.total ?? '0';
    const inputAmount = amountBase;
    const outputAmount = String(BigInt(inputAmount) - BigInt(totalRelayFee));
    // Use outputAmountToUsd so ETH fees are correctly priced (token units → USD via live price).
    // The old formula `route.amountTier - feeBaseUnits / 10^decimals` is correct for USDC
    // (1 USDC = $1) but wrong for ETH (subtracts wei-amount as if it were dollars).
    const outputUsd = outputAmountToUsd(outputAmount, dstToken.decimals, route.asset, route.dst);
    const totalFeeUsdNum = Math.max(0, route.amountTier - outputUsd);
    const totalFeeBps = route.amountTier > 0 ? Math.round((10000 * totalFeeUsdNum) / route.amountTier) : 0;

    const quote: NormalizedQuote = {
      batchId: '',
      ts: new Date(),
      srcChain: route.src,
      dstChain: route.dst,
      asset: route.asset,
      amountTier: route.amountTier,
      source: 'direct',
      bridge: 'across',
      inputAmount,
      outputAmount,
      inputUsd: String(route.amountTier),
      outputUsd: String(outputUsd),
      gasCostUsd: '0',
      protocolFeeBps: totalFeeBps,
      totalFeeBps,
      totalFeeUsd: String(totalFeeUsdNum),
      estimatedSeconds: data.estimatedFillTimeSec ?? 0,
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    logger.debug({ route, error: e }, 'Across fetch failed');
    return [];
  }
}
