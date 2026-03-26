import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken, isPlaceholder } from '../../config/tokens.js';
import { getChain } from '../../config/chains.js';
import { getFromAmountBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

/** cBridge token symbols — they use standard symbol names */
const CBRIDGE_SYMBOL: Record<string, string> = {
  ETH: 'ETH',
  USDC: 'USDC',
  USDT: 'USDT',
};

export async function fetchCbridge(route: RouteKey): Promise<NormalizedQuote[]> {
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

    const tokenSymbol = CBRIDGE_SYMBOL[route.asset];
    if (!tokenSymbol) return [];

    const amountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);

    const body = {
      src_chain_id: fromChainId,
      dst_chain_id: toChainId,
      token_symbol: tokenSymbol,
      amt: amountBase,
      usr_addr: '0x0000000000000000000000000000000000000000',
      slippage_tolerance: 300, // 3%
    };

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch('https://cbridge-prod2.celer.app/v2/estimateAmt', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    clearTimeout(t);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      estimated_receive_amt?: string;
      base_fee?: string;
      perc_fee?: string;
      err?: { code?: number; msg?: string };
    };

    if (data.err?.code || !data.estimated_receive_amt) return [];

    const outputAmount = data.estimated_receive_amt;
    const baseFee = data.base_fee ?? '0';
    const percFee = data.perc_fee ?? '0';
    const totalFeeBase = BigInt(baseFee) + BigInt(percFee);

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
      bridge: 'cbridge',
      inputAmount: amountBase,
      outputAmount,
      inputUsd: String(route.amountTier),
      outputUsd: String(outputUsd),
      gasCostUsd: '0',
      protocolFeeBps: totalFeeBps,
      totalFeeBps,
      totalFeeUsd: String(Number(totalFeeBase) / 10 ** srcToken.decimals),
      estimatedSeconds: 300, // cBridge ~5min
      isMultihop: false,
      steps: 1,
    };
    return [quote];
  } catch (e) {
    logger.debug({ route, error: e }, 'cBridge fetch failed');
    return [];
  }
}
