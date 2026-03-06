import { z } from 'zod';
import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { getToken } from '../../config/tokens.js';
import { isPlaceholder } from '../../config/tokens.js';
import { resolveBridgeName } from '../../config/bridges.js';
import { getFromAmountHuman, getFromAmountBase, humanToBase } from '../../lib/amounts.js';
import { logger } from '../../lib/logger.js';

/** Rubic uses 0x0 for native tokens (docs); we use LI.FI sentinel elsewhere */
const NATIVE_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const RUBIC_NATIVE = '0x0000000000000000000000000000000000000000';

/** Our chain slug → Rubic API blockchain id (docs / supported-chains). Sonic is distinct from Fantom. */
const RUBIC_BLOCKCHAIN: Record<string, string> = {
  ethereum: 'ETH',
  arbitrum: 'ARBITRUM',
  base: 'BASE',
  optimism: 'OPTIMISM',
  polygon: 'POLYGON',
  bsc: 'BSC',
  avalanche: 'AVALANCHE',
  solana: 'SOLANA',
  scroll: 'SCROLL',
  linea: 'LINEA',
  zksync: 'ZK_SYNC',
  mantle: 'MANTLE',
  sonic: 'SONIC',
  berachain: 'BERACHAIN',
  monad: 'MONAD',
  megaeth: 'MEGA_ETH',
  abstract: 'ABSTRACT',
  unichain: 'UNICHAIN',
  bitcoin: 'BITCOIN',
};

/** quoteBest returns a single quote object (see docs.rubic.finance) */
const RubicQuoteBestSchema = z.object({
  estimate: z.object({
    destinationTokenAmount: z.string(),
    destinationUsdAmount: z.number().optional(),
    durationInMinutes: z.number().optional(),
  }),
  fees: z
    .object({
      gasTokenFees: z
        .object({
          protocol: z.object({ fixedUsdAmount: z.number().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
  providerType: z.string(),
  id: z.string().optional(),
});

export interface RubicFetchOptions {
  /** When true, both src and dst are in RUBIC_FALLBACK_CHAINS — keep lifi/rango quotes instead of deduping. */
  isFallbackOnlyRoute?: boolean;
}

export async function fetchRubic(route: RouteKey, options?: RubicFetchOptions): Promise<NormalizedQuote[]> {
  const srcToken = getToken(route.src, route.asset);
  const dstToken = getToken(route.dst, route.asset);
  if (isPlaceholder(srcToken) || isPlaceholder(dstToken)) return [];

  const srcBlockchain = RUBIC_BLOCKCHAIN[route.src] ?? route.src.toUpperCase();
  const dstBlockchain = RUBIC_BLOCKCHAIN[route.dst] ?? route.dst.toUpperCase();

  const srcAddress =
    srcToken.address.toLowerCase() === NATIVE_SENTINEL.toLowerCase()
      ? RUBIC_NATIVE
      : srcToken.address;
  const dstAddress =
    dstToken.address.toLowerCase() === NATIVE_SENTINEL.toLowerCase()
      ? RUBIC_NATIVE
      : dstToken.address;

  const amountHuman = getFromAmountHuman(route.amountTier, route.asset, route.src);
  const inputAmountBase = getFromAmountBase(route.amountTier, route.asset, srcToken.decimals, route.src);
  const body = {
    srcTokenAddress: srcAddress,
    srcTokenBlockchain: srcBlockchain,
    srcTokenAmount: amountHuman,
    dstTokenAddress: dstAddress,
    dstTokenBlockchain: dstBlockchain,
    referrer: 'rubic.exchange',
  };

  const apiKey = process.env.RUBIC_API_KEY ?? '';
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://app.rubic.exchange',
    'Referer': 'https://app.rubic.exchange/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(apiKey ? { 'x-api-key': apiKey } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch('https://api-v2.rubic.exchange/api/routes/quoteBest', {
      method: 'POST',
      signal: controller.signal,
      headers: baseHeaders,
      body: JSON.stringify(body),
    });
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
  clearTimeout(timeout);

  if (res.status === 404) return [];

  if (!res.ok) {
    // Read body only once here — avoids "Body already read" when response is OK
    const errBody = await res.text().catch(() => '');
    if (res.status === 429) {
      logger.debug({ route: `${route.src}→${route.dst}/${route.asset}/$${route.amountTier}`, status: res.status }, 'Rubic rate limited — skipping');
      return [];
    }
    if (res.status === 403) {
      const maxRetries = 2;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const delayMs = 500 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delayMs));
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => retryController.abort(), 10_000);
        try {
          const retryRes = await fetch('https://api-v2.rubic.exchange/api/routes/quoteBest', {
            method: 'POST',
            signal: retryController.signal,
            headers: baseHeaders,
            body: JSON.stringify(body),
          });
          clearTimeout(retryTimeout);
          if (retryRes.ok) {
            res = retryRes;
            break;
          }
          if (retryRes.status !== 403) {
            throw new Error(`HTTP ${retryRes.status}: ${(await retryRes.text().catch(() => '')).slice(0, 100)}`);
          }
        } catch (retryErr) {
          clearTimeout(retryTimeout);
          if (attempt === maxRetries - 1) {
            logger.debug({ route: `${route.src}→${route.dst}/${route.asset}/$${route.amountTier}`, status: 403 }, 'Rubic 403 after retries — skipping');
            return [];
          }
        }
      }
      if (!res.ok) {
        logger.debug({ route: `${route.src}→${route.dst}/${route.asset}/$${route.amountTier}`, status: 403 }, 'Rubic 403 (auth/Cloudflare) — skipping');
        return [];
      }
    }
    if (res.status === 400) {
      const isNoRoute =
        /Multicall error|no route|unsupported|invalid/i.test(errBody) ||
        errBody.includes('"code":999999');
      if (isNoRoute) {
        logger.debug({ route: `${route.src}→${route.dst}/${route.asset}/$${route.amountTier}` }, 'Rubic 400 (no route / multicall) — skipping');
        return [];
      }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const raw = await res.json();
  const parsed = RubicQuoteBestSchema.safeParse(raw);
  if (!parsed.success) {
    logger.debug({ route, err: parsed.error.flatten() }, 'Rubic quoteBest response invalid');
    return [];
  }

  const q = parsed.data;
  const skipLifiRangoDedup = options?.isFallbackOnlyRoute === true;
  if (!skipLifiRangoDedup && (q.providerType === 'lifi' || q.providerType === 'rango')) return [];
  const bridge = resolveBridgeName('rubic', q.providerType);
  const canonicalBridge = bridge ?? q.providerType.toLowerCase();
  const destUsd = q.estimate.destinationUsdAmount ?? route.amountTier;
  const durationSec = Math.round((q.estimate.durationInMinutes ?? 0) * 60);
  const protocolFeeUsd = q.fees?.gasTokenFees?.protocol?.fixedUsdAmount ?? 0;
  const totalFeeBps = Math.round((protocolFeeUsd / route.amountTier) * 10_000);

  const ts = new Date();
  const quote: NormalizedQuote = {
    batchId: '',
    ts,
    srcChain: route.src,
    dstChain: route.dst,
    asset: route.asset,
    amountTier: route.amountTier,
    source: 'rubic',
    bridge: canonicalBridge,
    inputAmount: inputAmountBase,
    outputAmount: humanToBase(q.estimate.destinationTokenAmount, dstToken.decimals),
    inputUsd: String(route.amountTier),
    outputUsd: String(destUsd),
    gasCostUsd: '0',
    protocolFeeBps: totalFeeBps,
    totalFeeBps,
    totalFeeUsd: String(protocolFeeUsd),
    estimatedSeconds: durationSec,
    isMultihop: false,
    steps: 1,
  };
  return [quote];
}
