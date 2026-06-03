import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken } from '../../config/tokens.js';
import { getFromAmountBase, outputAmountToUsd } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';
import { fetchWithTimeout } from '../../lib/utils.js';
import { RateLimitError } from '../../lib/errors.js';

export async function fetchMeson(route: RouteKey, _key: string): Promise<NormalizedQuote[]> {
  try {
    const srcToken = getToken(route.src, route.asset);
    const dstToken = getToken(route.dst, route.asset);
    const fromStr = `${route.src}:${srcToken.address}`;
    const toStr = `${route.dst}:${dstToken.address}`;
    const amountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);

    const body = { from: fromStr, to: toStr, amount: amountBase };
    const res = await fetchWithTimeout('https://relayer.meson.fi/api/v1/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 10_000);
    if (res.status === 429) throw new RateLimitError(Math.max(parseInt(res.headers.get('retry-after') ?? '0', 10) * 1000, 60_000));
    if (!res.ok) return [];

    const data = (await res.json()) as {
      result?: { totalFee?: string; lpFee?: string; serviceFee?: string };
    };
    const totalFee = data.result?.totalFee ?? '0';
    const inputAmount = amountBase;
    const outputAmount = String(BigInt(inputAmount) - BigInt(totalFee));
    const outputUsdNum = outputAmountToUsd(outputAmount, dstToken.decimals, route.asset, route.dst);
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
      bridge: 'meson',
      inputAmount,
      outputAmount,
      inputUsd: String(route.amountTier),
      outputUsd: String(outputUsdNum),
      gasCostUsd: '0',
      protocolFeeBps: totalFeeBps,
      totalFeeBps,
      totalFeeUsd: String(totalFeeUsdNum),
      estimatedSeconds: 0,
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
    logger.debug({ route, error: e }, 'Meson fetch failed');
    return [];
  }
}
