import { z } from 'zod';
import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken, isPlaceholder } from '../../config/tokens.js';
import { getChain } from '../../config/chains.js';
import { resolveBridgeName } from '../../config/bridges.js';
import { getFromAmountBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

/** Chains that Rango's /routing/best endpoint does not support (confirmed via 400 responses). */
const RANGO_UNSUPPORTED = new Set([
  'mantle',    // MANTLE not in Rango supported list
  'abstract',  // ABSTRACT not in Rango supported list
]);

const RANGO_BLOCKCHAIN: Record<string, string> = {
  ethereum: 'ETH',
  arbitrum: 'ARBITRUM',
  base: 'BASE',
  optimism: 'OPTIMISM',
  polygon: 'POLYGON',
  bsc: 'BSC',
  avalanche: 'AVAX_CCHAIN',
  solana: 'SOLANA',
  bitcoin: 'BTC',
  scroll: 'SCROLL',
  linea: 'LINEA',
  zksync: 'ZKSYNC',
  sonic: 'SONIC',
  berachain: 'BERACHAIN',
  monad: 'MONAD',
  megaeth: 'MEGAETH',
  hyperliquid: 'HYPERLIQUID',
  unichain: 'UNICHAIN',
};

const RangoSwapFeeSchema = z.object({
  expenseType: z.string().optional(),
  amount: z.string(),
  name: z.string().optional(),
  price: z.number().optional(),
  asset: z.unknown().optional(),
});

const RangoSwapSchema = z.object({
  swapperId: z.string(),
  swapperType: z.string().optional(),
  from: z.object({ blockchain: z.string(), symbol: z.string(), address: z.string().nullable(), decimals: z.number(), usdPrice: z.number().optional() }),
  to: z.object({ blockchain: z.string(), symbol: z.string(), address: z.string().nullable(), decimals: z.number(), usdPrice: z.number().optional() }),
  fromAmount: z.string().optional(),
  toAmount: z.string().optional(),
  fee: z.array(RangoSwapFeeSchema).optional().default([]),
  estimatedTimeInSeconds: z.number().optional(),
});

const RangoResponseSchema = z.object({
  requestAmount: z.string().optional(),
  result: z.object({
    outputAmount: z.string(),
    swaps: z.array(RangoSwapSchema),
    resultType: z.string().optional(),
  }).optional(),
  error: z.string().nullable().optional(),
});

export async function fetchRango(route: RouteKey): Promise<NormalizedQuote[]> {
  if (RANGO_UNSUPPORTED.has(route.src) || RANGO_UNSUPPORTED.has(route.dst)) return [];

  const srcToken = getToken(route.src, route.asset);
  const dstToken = getToken(route.dst, route.asset);
  if (isPlaceholder(srcToken) || isPlaceholder(dstToken)) return [];

  if (!RANGO_BLOCKCHAIN[route.src] || !RANGO_BLOCKCHAIN[route.dst]) return [];

  const fromChain = RANGO_BLOCKCHAIN[route.src]!;
  const toChain = RANGO_BLOCKCHAIN[route.dst]!;
  const amountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);

  // Use the chain's actual native token symbol (BNB, AVAX, SOL, etc.) rather than 'ETH'
  // so Rango can correctly identify the token on each chain.
  const fromSymbol = route.asset === 'ETH' ? getChain(route.src).nativeToken : route.asset;
  const toSymbol = route.asset === 'ETH' ? getChain(route.dst).nativeToken : route.asset;

  const apiKey = process.env.RANGO_API_KEY ?? 'free';
  const url = `https://api.rango.exchange/routing/best?apiKey=${encodeURIComponent(apiKey)}`;
  const body = {
    from: { blockchain: fromChain, symbol: fromSymbol, address: srcToken.address },
    to: { blockchain: toChain, symbol: toSymbol, address: dstToken.address },
    amount: amountBase,
    slippage: '1',
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 100)}`);
  }

  const raw = await res.json();
  const parsed = RangoResponseSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.result) {
    logger.debug({ route, error: parsed.success ? parsed.data.error : parsed.error.message }, 'Rango response invalid');
    return [];
  }

  const result = parsed.data.result;
  const swaps = result.swaps ?? [];
  if (swaps.length === 0) return [];

  const firstSwap = swaps[0]!;
  const bridgeName = firstSwap.swapperId;
  const bridge = resolveBridgeName('rango', bridgeName);
  if (!bridge) return [];

  const outputAmount = result.outputAmount;
  const requestAmount = parsed.data.requestAmount ?? amountBase;

  const inputPrice = firstSwap.from.usdPrice ?? 0;
  const outputPrice = firstSwap.to.usdPrice ?? 0;
  const inputUsd = inputPrice > 0 ? String(Number(requestAmount) / (10 ** srcToken.decimals) * inputPrice) : String(route.amountTier);
  const outputUsd = outputPrice > 0 ? String(Number(outputAmount) / (10 ** dstToken.decimals) * outputPrice) : '0';

  const allFees = firstSwap.fee ?? [];
  let gasCostUsd = 0;
  let protocolFeeUsd = 0;
  for (const f of allFees) {
    const feeValue = Number(f.amount || 0) * (f.price ?? 0);
    if (f.expenseType === 'FROM_SOURCE_WALLET') {
      gasCostUsd += feeValue;
    } else {
      protocolFeeUsd += feeValue;
    }
  }
  let totalFeeUsd = gasCostUsd + protocolFeeUsd;
  // Rango fee.amount can be in base units; fallback to input-output when fee is unrealistically high
  const inputUsdNum = Number(inputUsd);
  const outputUsdNum = Number(outputUsd);
  if (inputUsdNum > 0 && totalFeeUsd > inputUsdNum) {
    totalFeeUsd = Math.max(0, inputUsdNum - outputUsdNum);
  }
  const totalFeeBps = inputUsdNum > 0 ? Math.round((10000 * totalFeeUsd) / inputUsdNum) : 0;
  const protocolFeeBps = inputUsdNum > 0 ? Math.round((10000 * Math.min(protocolFeeUsd, totalFeeUsd)) / inputUsdNum) : 0;

  const estimatedSeconds = firstSwap.estimatedTimeInSeconds ?? 0;

  const quote: NormalizedQuote = {
    batchId: '',
    ts: new Date(),
    srcChain: route.src,
    dstChain: route.dst,
    asset: route.asset,
    amountTier: route.amountTier,
    source: 'rango',
    bridge,
    inputAmount: requestAmount,
    outputAmount,
    inputUsd,
    outputUsd,
    gasCostUsd: String(gasCostUsd),
    protocolFeeBps,
    totalFeeBps,
    totalFeeUsd: String(totalFeeUsd),
    estimatedSeconds,
    isMultihop: swaps.length > 1,
    steps: swaps.length,
  };

  return [quote];
}

