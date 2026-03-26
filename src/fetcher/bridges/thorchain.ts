import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken, isPlaceholder } from '../../config/tokens.js';
import { getFromAmountBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

/** THORChain asset notation: CHAIN.SYMBOL */
const THOR_ASSET: Record<string, Record<string, string>> = {
  ethereum: { ETH: 'ETH.ETH', USDC: 'ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', USDT: 'ETH.USDT-0xdAC17F958D2ee523a2206206994597C13D831ec7' },
  bsc: { ETH: 'BSC.BNB' },
  avalanche: { ETH: 'AVAX.AVAX', USDC: 'AVAX.USDC-0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' },
  bitcoin: { ETH: 'BTC.BTC' },
};

export async function fetchThorchain(route: RouteKey): Promise<NormalizedQuote[]> {
  try {
    const fromAsset = THOR_ASSET[route.src]?.[route.asset];
    const toAsset = THOR_ASSET[route.dst]?.[route.asset];
    if (!fromAsset || !toAsset) return [];

    const srcToken = getToken(route.src, route.asset);
    const dstToken = getToken(route.dst, route.asset);
    if (isPlaceholder(srcToken) || isPlaceholder(dstToken)) return [];

    // THORChain amounts are in base units (8 decimals for most)
    const amountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);
    // Convert to THORChain 8-decimal base
    const thorAmount = (BigInt(amountBase) * 10n ** 8n / 10n ** BigInt(srcToken.decimals)).toString();

    const url = new URL('https://thornode.ninerealms.com/thorchain/quote/swap');
    url.searchParams.set('from_asset', fromAsset);
    url.searchParams.set('to_asset', toAsset);
    url.searchParams.set('amount', thorAmount);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      expected_amount_out?: string;
      fees?: { total?: string; outbound?: string; liquidity?: string; affiliate?: string };
      inbound_confirmation_seconds?: number;
      outbound_delay_seconds?: number;
      error?: string;
    };

    if (data.error || !data.expected_amount_out) return [];

    // THORChain returns amounts in 8 decimals — convert to destination token decimals
    const thorOut = BigInt(data.expected_amount_out);
    const outputAmount = (thorOut * 10n ** BigInt(dstToken.decimals) / 10n ** 8n).toString();

    const outputHuman = Number(outputAmount) / 10 ** dstToken.decimals;
    const inputHuman = Number(amountBase) / 10 ** srcToken.decimals;
    const priceRatio = route.amountTier / inputHuman;
    const outputUsd = route.asset === 'ETH' ? outputHuman * priceRatio : outputHuman;
    const totalFeeBps = route.amountTier > 0 ? Math.round((10000 * (route.amountTier - outputUsd)) / route.amountTier) : 0;

    const estimatedSeconds = (data.inbound_confirmation_seconds ?? 0) + (data.outbound_delay_seconds ?? 0);

    const quote: NormalizedQuote = {
      batchId: '',
      ts: new Date(),
      srcChain: route.src,
      dstChain: route.dst,
      asset: route.asset,
      amountTier: route.amountTier,
      source: 'direct',
      bridge: 'thorchain',
      inputAmount: amountBase,
      outputAmount,
      inputUsd: String(route.amountTier),
      outputUsd: String(outputUsd),
      gasCostUsd: '0',
      protocolFeeBps: totalFeeBps,
      totalFeeBps,
      totalFeeUsd: String(Math.max(0, route.amountTier - outputUsd)),
      estimatedSeconds,
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    logger.debug({ route, error: e }, 'THORChain fetch failed');
    return [];
  }
}
