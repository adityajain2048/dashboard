// src/config/tokens.ts
import type { TokenEntry, Asset } from '../types/index.js';

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
  { chain: 'sonic',     asset: 'USDT', address: '0x6047828dc181963ba44974801ff68e538da5eaf9', decimals: 6, notes: 'Bridged USDT (Sonic Labs)' },

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

  // ─── Mantle (5000) ───
  { chain: 'mantle',    asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'MNT native' },
  { chain: 'mantle',    asset: 'USDC', address: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9', decimals: 6 },
  { chain: 'mantle',    asset: 'USDT', address: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE', decimals: 6 },

  // ─── Berachain (80094) ───
  { chain: 'berachain', asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'BERA native' },
  { chain: 'berachain', asset: 'USDC', address: '0x549943e04f40284185054145c6E4e9568C1D3241', decimals: 6 },
  { chain: 'berachain', asset: 'USDT', address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736', decimals: 6, notes: 'USDT0 via LayerZero OFT' },

  // ─── HyperEVM (999) ───
  { chain: 'hyperliquid', asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'HYPE native' },
  { chain: 'hyperliquid', asset: 'USDC', address: '0xb88339CB7199b77E23DB6E890353E22632Ba630f', decimals: 6 },
  { chain: 'hyperliquid', asset: 'USDT', address: '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb', decimals: 6, notes: 'USDT0 on HyperEVM via LayerZero OFT' },

  // ─── Abstract (2741) ───
  { chain: 'abstract',  asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'abstract',  asset: 'USDC', address: '0x84a71ccd554cc1b02749b35d22f684cc8ec987e1', decimals: 6, notes: 'Bridged USDC.e via Stargate' },
  { chain: 'abstract',  asset: 'USDT', address: '0x0709f39376deee2a2dfc94a58edeb2eb9df012bd', decimals: 6, notes: 'Bridged USDT (Abstract)' },

  // ─── Unichain (130) ───
  { chain: 'unichain',  asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'unichain',  asset: 'USDC', address: '0x078D782b760474a361dDA0AF3839290b0EF57AD6', decimals: 6 },
  { chain: 'unichain',  asset: 'USDT', address: '0x588ce4f028d8e7b53b687865d6a67b3a54c75518', decimals: 6, notes: 'Tether USD on Unichain' },

  // ─── Monad (143) ───
  { chain: 'monad',     asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'MON native' },
  { chain: 'monad',     asset: 'USDC', address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6, notes: 'Native Circle USDC + CCTP v2' },
  { chain: 'monad',     asset: 'USDT', address: '0xe7cd86e13ac4309349f30b3435a9d337750fc82d', decimals: 6, notes: 'USDT0 via LayerZero OFT' },

  // ─── MegaETH (4326) ───
  { chain: 'megaeth',   asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'megaeth',   asset: 'USDC', address: 'none', decimals: 0, notes: 'No Circle USDC; MegaETH uses USDm (Ethena) as primary stable' },
  { chain: 'megaeth',   asset: 'USDT', address: '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb', decimals: 6, notes: 'USDT0 via LayerZero OFT' },

  // ─── Solana ───
  { chain: 'solana',    asset: 'ETH',  address: 'So11111111111111111111111111111111111111112', decimals: 9, notes: 'SOL native (mapped to ETH asset for cross-chain context)' },
  { chain: 'solana',    asset: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  { chain: 'solana',    asset: 'USDT', address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },

  // ─── Bitcoin ───
  { chain: 'bitcoin',   asset: 'ETH',  address: 'native', decimals: 8, notes: 'BTC native (mapped to ETH asset slot)' },
  { chain: 'bitcoin',   asset: 'USDC', address: 'none',   decimals: 0, notes: 'No USDC on Bitcoin L1' },
  { chain: 'bitcoin',   asset: 'USDT', address: 'none',   decimals: 0, notes: 'No USDT on Bitcoin L1' },
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
  return TOKENS.filter(t => t.chain === chain && !isPlaceholder(t)) as TokenEntry[];
}
