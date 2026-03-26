import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken, isPlaceholder } from '../../config/tokens.js';
import { getChain } from '../../config/chains.js';
import { getFromAmountBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

export async function fetchSymbiosis(route: RouteKey): Promise<NormalizedQuote[]> {
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

    const body = {
      tokenAmountIn: {
        address: srcToken.address,
        chainId: fromChainId,
        amount: amountBase,
        decimals: srcToken.decimals,
        symbol: route.asset,
      },
      tokenOut: {
        address: dstToken.address,
        chainId: toChainId,
        decimals: dstToken.decimals,
        symbol: route.asset,
      },
      from: '0x0000000000000000000000000000000000000000',
      to: '0x0000000000000000000000000000000000000000',
      slippage: 100, // 1%
    };

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch('https://api-v2.symbiosis.finance/crosschain/v1/swap', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    clearTimeout(t);

    if (!res.ok) return [];

    const data = (await res.json()) as {
      tokenAmountOut?: { amount?: string };
      fee?: { amount?: string };
      estimatedTime?: number;
      amountInUsd?: { amount?: string };
    };

    if (!data.tokenAmountOut?.amount) return [];

    const outputAmount = data.tokenAmountOut.amount;
    const outputHuman = Number(outputAmount) / 10 ** dstToken.decimals;
    const outputUsd = route.asset === 'ETH'
      ? outputHuman * (route.amountTier / (Number(amountBase) / 10 ** srcToken.decimals))
      : outputHuman;
    const totalFeeBps = route.amountTier > 0 ? Math.round((10000 * (route.amountTier - outputUsd)) / route.amountTier) : 0;

    const quote: NormalizedQuote = {
      batchId: '',
      ts: new Date(),
      srcChain: route.src,
      dstChain: route.dst,
      asset: route.asset,
      amountTier: route.amountTier,
      source: 'direct',
      bridge: 'symbiosis',
      inputAmount: amountBase,
      outputAmount,
      inputUsd: String(route.amountTier),
      outputUsd: String(outputUsd),
      gasCostUsd: '0',
      protocolFeeBps: totalFeeBps,
      totalFeeBps,
      totalFeeUsd: String(Math.max(0, route.amountTier - outputUsd)),
      estimatedSeconds: data.estimatedTime ?? 300,
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    logger.debug({ route, error: e }, 'Symbiosis fetch failed');
    return [];
  }
}
