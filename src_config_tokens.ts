// src/config/tokens.ts
import type { TokenEntry, Asset } from '../types';

// ═══════════════════════════════════════════
// TOKEN ADDRESSES BY CHAIN
// Native tokens use 0xEEE...EEE (LI.FI convention) or chain-specific sentinel
// ═══════════════════════════════════════════

export const TOKENS: readonly TokenEntry[] = [
  // ─── Ethereum (1) ───
  { chain: 'ethereum',  asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'ethereum',  asset: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  { chain: 'ethereum',  asset: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },

  // ─── Arbitrum (42161) ───
  { chain: 'arbitrum',  asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'arbitrum',  asset: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  { chain: 'arbitrum',  asset: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },

  // ─── Base (8453) ───
  { chain: 'base',      asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'base',      asset: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  { chain: 'base',      asset: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },

  // ─── Optimism (10) ───
  { chain: 'optimism',  asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'optimism',  asset: 'USDC', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
  { chain: 'optimism',  asset: 'USDT', address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },

  // ─── Polygon (137) ───
  { chain: 'polygon',   asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'POL native, but ETH sentinel for bridging context' },
  { chain: 'polygon',   asset: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
  { chain: 'polygon',   asset: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },

  // ─── BNB Chain (56) ───
  { chain: 'bsc',       asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'BNB native' },
  { chain: 'bsc',       asset: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, notes: 'BSC USDC is 18 decimals (Binance-pegged)' },
  { chain: 'bsc',       asset: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, notes: 'BSC USDT is 18 decimals (Binance-pegged)' },

  // ─── Avalanche (43114) ───
  { chain: 'avalanche', asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'AVAX native' },
  { chain: 'avalanche', asset: 'USDC', address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },
  { chain: 'avalanche', asset: 'USDT', address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6 },

  // ─── Sonic (146) ───
  { chain: 'sonic',     asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'S native' },
  { chain: 'sonic',     asset: 'USDC', address: '0x29219dd400f2Bf60E5a23d13Be72B486D4038894', decimals: 6 },
  { chain: 'sonic',     asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Not yet deployed — placeholder' },

  // ─── Linea (59144) ───
  { chain: 'linea',     asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'linea',     asset: 'USDC', address: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff', decimals: 6 },
  { chain: 'linea',     asset: 'USDT', address: '0xA219439258ca9da29E9Cc4cE5596924745e12B93', decimals: 6 },

  // ─── zkSync Era (324) ───
  { chain: 'zksync',    asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'zksync',    asset: 'USDC', address: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4', decimals: 6 },
  { chain: 'zksync',    asset: 'USDT', address: '0x493257fD37EDB34451f62EDf8D2a0C418852bA4C', decimals: 6 },

  // ─── Scroll (534352) ───
  { chain: 'scroll',    asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'scroll',    asset: 'USDC', address: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4', decimals: 6 },
  { chain: 'scroll',    asset: 'USDT', address: '0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df', decimals: 6 },

  // ─── Blast (81457) ───
  { chain: 'blast',     asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'blast',     asset: 'USDC', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Blast uses USDB (rebasing); USDC may not be native' },
  { chain: 'blast',     asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Placeholder' },

  // ─── Mantle (5000) ───
  { chain: 'mantle',    asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'MNT native' },
  { chain: 'mantle',    asset: 'USDC', address: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9', decimals: 6 },
  { chain: 'mantle',    asset: 'USDT', address: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE', decimals: 6 },

  // ─── Berachain (80094) ───
  { chain: 'berachain', asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'BERA native' },
  { chain: 'berachain', asset: 'USDC', address: '0x549943e04f40284185054145c6E4e9568C1D3241', decimals: 6 },
  { chain: 'berachain', asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Placeholder' },

  // ─── Sei (EVM address space) ───
  { chain: 'sei',       asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'SEI native' },
  { chain: 'sei',       asset: 'USDC', address: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392', decimals: 6 },
  { chain: 'sei',       asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Placeholder' },

  // ─── HyperEVM (999) ───
  { chain: 'hyperliquid', asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'HYPE native' },
  { chain: 'hyperliquid', asset: 'USDC', address: '0xb88339CB7199b77E23DB6E890353E22632Ba630f', decimals: 6 },
  { chain: 'hyperliquid', asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Placeholder' },

  // ─── Abstract (2741) ───
  { chain: 'abstract',  asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'abstract',  asset: 'USDC', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Check bridge-specific' },
  { chain: 'abstract',  asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Placeholder' },

  // ─── Unichain (130) ───
  { chain: 'unichain',  asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'unichain',  asset: 'USDC', address: '0x078D782b760474a361dDA0AF3839290b0EF57AD6', decimals: 6 },
  { chain: 'unichain',  asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Placeholder' },

  // ─── StarkNet ───
  { chain: 'starknet',  asset: 'ETH',  address: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7', decimals: 18 },
  { chain: 'starknet',  asset: 'USDC', address: '0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb', decimals: 6 },
  { chain: 'starknet',  asset: 'USDT', address: '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8', decimals: 6 },

  // ─── Monad (143) ───
  { chain: 'monad',     asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'MON native' },
  { chain: 'monad',     asset: 'USDC', address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6, notes: 'Native Circle USDC + CCTP v2' },
  { chain: 'monad',     asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Not confirmed yet' },

  // ─── MegaETH (4326) ───
  { chain: 'megaeth',   asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'megaeth',   asset: 'USDC', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'No native Circle USDC yet; USDm (Ethena) is primary stable' },
  { chain: 'megaeth',   asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Placeholder' },

  // ─── Solana ───
  { chain: 'solana',    asset: 'ETH',  address: 'So11111111111111111111111111111111111111112', decimals: 9, notes: 'SOL native (mapped to ETH asset for cross-chain context)' },
  { chain: 'solana',    asset: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  { chain: 'solana',    asset: 'USDT', address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },

  // ─── Bitcoin ───
  { chain: 'bitcoin',   asset: 'ETH',  address: 'native', decimals: 8, notes: 'BTC native (mapped to ETH asset slot)' },
  { chain: 'bitcoin',   asset: 'USDC', address: 'none',   decimals: 0, notes: 'No USDC on Bitcoin L1' },
  { chain: 'bitcoin',   asset: 'USDT', address: 'none',   decimals: 0, notes: 'No USDT on Bitcoin L1' },

  // ─── Tron ───
  { chain: 'tron',      asset: 'ETH',  address: 'native',                                        decimals: 6, notes: 'TRX native' },
  { chain: 'tron',      asset: 'USDC', address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', decimals: 6 },
  { chain: 'tron',      asset: 'USDT', address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 },

  // ─── Sui ───
  { chain: 'sui',       asset: 'ETH',  address: '0x2::sui::SUI', decimals: 9, notes: 'SUI native' },
  { chain: 'sui',       asset: 'USDC', address: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', decimals: 6 },
  { chain: 'sui',       asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Placeholder' },

  // ─── Aptos ───
  { chain: 'aptos',     asset: 'ETH',  address: '0x1::aptos_coin::AptosCoin', decimals: 8, notes: 'APT native' },
  { chain: 'aptos',     asset: 'USDC', address: '0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b', decimals: 6 },
  { chain: 'aptos',     asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Placeholder' },

  // ─── TON ───
  { chain: 'ton',       asset: 'ETH',  address: 'native', decimals: 9, notes: 'TON native' },
  { chain: 'ton',       asset: 'USDC', address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', decimals: 6 },
  { chain: 'ton',       asset: 'USDT', address: 'EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA', decimals: 6 },

  // ─── Osmosis ───
  { chain: 'osmosis',   asset: 'ETH',  address: 'uosmo', decimals: 6, notes: 'OSMO native' },
  { chain: 'osmosis',   asset: 'USDC', address: 'ibc/D189335C6E4A68B513C10AB227BF1C1D38C746766278BA3EEB4FB14124F1D858', decimals: 6, notes: 'IBC USDC via Noble' },
  { chain: 'osmosis',   asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Placeholder' },

  // ─── Injective ───
  { chain: 'injective', asset: 'ETH',  address: 'inj', decimals: 18, notes: 'INJ native' },
  { chain: 'injective', asset: 'USDC', address: 'ibc/2CBC2EA121AE42563B08028466F37B600F2D7D4282342DE938283CC3FB2BC00E', decimals: 6, notes: 'IBC USDC' },
  { chain: 'injective', asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Placeholder' },

  // ─── XRPL ───
  { chain: 'xrpl',      asset: 'ETH',  address: 'native', decimals: 6, notes: 'XRP native' },
  { chain: 'xrpl',      asset: 'USDC', address: '5553444300000000000000000000000000000000', decimals: 6, notes: 'Issued USDC on XRPL' },
  { chain: 'xrpl',      asset: 'USDT', address: '0x0000000000000000000000000000000000000000', decimals: 6, notes: 'Placeholder' },
];

// ─── Lookup functions ───

const TOKEN_MAP = new Map<string, TokenEntry>();
for (const t of TOKENS) {
  TOKEN_MAP.set(`${t.chain}:${t.asset}`, t);
}

/** Get token for a chain + asset. Throws if not found. */
export function getToken(chain: string, asset: Asset): TokenEntry {
  const key = `${chain}:${asset}`;
  const entry = TOKEN_MAP.get(key);
  if (!entry) throw new Error(`Token not found: ${key}`);
  return entry;
}

/** Check if a token is a placeholder (zero address) */
export function isPlaceholder(entry: TokenEntry): boolean {
  return entry.address === '0x0000000000000000000000000000000000000000'
      || entry.address === 'none';
}

/** Get all valid (non-placeholder) tokens for a chain */
export function getValidTokens(chain: string): TokenEntry[] {
  return TOKENS.filter(t => t.chain === chain && !isPlaceholder(t));
}
