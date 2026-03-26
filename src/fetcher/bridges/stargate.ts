import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken, isPlaceholder } from '../../config/tokens.js';
import { getChain } from '../../config/chains.js';
import { getFromAmountBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

/** Stargate V2 uses LayerZero Endpoint IDs (not EVM chainIds) */
const STARGATE_EID: Record<string, number> = {
  ethereum: 30101,
  arbitrum: 30110,
  optimism: 30111,
  polygon: 30109,
  base: 30184,
  bsc: 30102,
  avalanche: 30106,
  scroll: 30214,
  linea: 30183,
  mantle: 30181,
  sonic: 30332,
};

/** Pool addresses for Stargate V2 per chain+asset */
const STARGATE_POOL: Record<string, Record<string, string>> = {
  ethereum: {
    ETH: '0x77b2043768d28E9C9aB44E1aBfC95944bcE57931',
    USDC: '0xc026395860Db2d07ee33e05fE50ed7bD583189C7',
    USDT: '0x933597a323Eb81cAe705C5bC29985172fd5A3973',
  },
  arbitrum: {
    ETH: '0xA45B5130f36CDcA45667738e2a258AB09f4A27F5',
    USDC: '0xe8CDF27AcD73a434D661C84887215F7598e7d0d3',
    USDT: '0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0',
  },
  optimism: {
    ETH: '0xe8CDF27AcD73a434D661C84887215F7598e7d0d3',
    USDC: '0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0',
  },
  base: {
    ETH: '0xdc181Bd607330aeeBEF6ea62e03e5e1Fb4B6F7C04',
    USDC: '0x27a16dc786820B16E5c9028b75B99F6f604b5d26',
  },
  bsc: {
    USDT: '0x138EB30f73BC423c6455C53df6D89CB01d9eBc63',
  },
  avalanche: {
    USDC: '0x5634c4a5FEd09819E3c46D86A965Dd9447d86e47',
    USDT: '0x12dC9256Acc9895B076f6638D628382881e62CeE',
  },
  polygon: {
    USDC: '0x9Aa02D4Fae7F58b8E8f34c66E756cC734DAc7fe4',
    USDT: '0xd47b03ee6d86Cf251ee7860FB2ACf9f91B9fD4d7',
  },
  scroll: {
    ETH: '0xC2b638Cb5042c1B3c5d3459b48A3b86A4412bE28',
  },
  linea: {
    ETH: '0x81F6138153d473E8c5EcebD3DC8Cd4903506B075',
  },
  mantle: {
    USDC: '0xAc290Ad4e0c891FDc295d86b09Bc8b8E7b2d6236',
    USDT: '0xB715B85682B731dB9D5063187C450095c91C57FC',
  },
};

export async function fetchStargate(route: RouteKey): Promise<NormalizedQuote[]> {
  try {
    const srcEid = STARGATE_EID[route.src];
    const dstEid = STARGATE_EID[route.dst];
    if (!srcEid || !dstEid) return [];

    const srcPool = STARGATE_POOL[route.src]?.[route.asset];
    if (!srcPool) return [];

    const srcToken = getToken(route.src, route.asset);
    const dstToken = getToken(route.dst, route.asset);
    if (isPlaceholder(srcToken) || isPlaceholder(dstToken)) return [];

    const amountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);

    // Stargate V2 API: quote send
    const url = new URL('https://mainnet.stargate-api.com/v1/quote');
    url.searchParams.set('srcPool', srcPool);
    url.searchParams.set('dstEid', String(dstEid));
    url.searchParams.set('amount', amountBase);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      amountReceivable?: string;
      fee?: { lzFee?: string; eqFee?: string; eqReward?: string; protocolFee?: string };
    };

    if (!data.amountReceivable) return [];

    const outputAmount = data.amountReceivable;
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
      bridge: 'stargate',
      inputAmount: amountBase,
      outputAmount,
      inputUsd: String(route.amountTier),
      outputUsd: String(outputUsd),
      gasCostUsd: '0',
      protocolFeeBps: totalFeeBps,
      totalFeeBps,
      totalFeeUsd: String(Math.max(0, route.amountTier - outputUsd)),
      estimatedSeconds: 60, // Stargate ~1min for EVM
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    logger.debug({ route, error: e }, 'Stargate fetch failed');
    return [];
  }
}
