import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken } from '../../config/tokens.js';
import { getFromAmountBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

export async function fetchMeson(route: RouteKey): Promise<NormalizedQuote[]> {
  try {
    const srcToken = getToken(route.src, route.asset);
    const dstToken = getToken(route.dst, route.asset);
    const fromStr = `${route.src}:${srcToken.address}`;
    const toStr = `${route.dst}:${dstToken.address}`;
    const amountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);

    const body = { from: fromStr, to: toStr, amount: amountBase };
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch('https://relayer.meson.fi/api/v1/price', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    clearTimeout(t);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      result?: { totalFee?: string; lpFee?: string; serviceFee?: string };
    };
    const totalFee = data.result?.totalFee ?? '0';
    const inputAmount = amountBase;
    const outputAmount = String(BigInt(inputAmount) - BigInt(totalFee));
    const outputUsd = String(Math.max(0, route.amountTier - Number(totalFee) / 10 ** srcToken.decimals));
    const totalFeeBps = route.amountTier > 0 ? Math.round((10000 * Number(totalFee)) / (10 ** srcToken.decimals * route.amountTier)) : 0;

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
      outputUsd,
      gasCostUsd: '0',
      protocolFeeBps: totalFeeBps,
      totalFeeBps,
      totalFeeUsd: totalFee,
      estimatedSeconds: 0,
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    logger.debug({ route, error: e }, 'Meson fetch failed');
    return [];
  }
}
