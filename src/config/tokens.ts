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

  // ─── Blast (81457) — Squid-supported ───
  { chain: 'blast',      asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'blast',      asset: 'USDC', address: 'none', decimals: 0, notes: 'No USDC on Blast via Squid' },
  { chain: 'blast',      asset: 'USDT', address: 'none', decimals: 0, notes: 'No USDT on Blast via Squid' },

  // ─── Celo (42220) ───
  { chain: 'celo',       asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'CELO native' },
  { chain: 'celo',       asset: 'USDC', address: '0xceBa9300f2b948710d2653dD7b07f33A8B32118C', decimals: 6 },
  { chain: 'celo',       asset: 'USDT', address: '0x48065fbbe25f71C9282ddf5e1cD6D6A887483D5e', decimals: 6 },

  // ─── Fantom (250) ───
  { chain: 'fantom',     asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'FTM native' },
  { chain: 'fantom',     asset: 'USDC', address: '0x28a92dde19D9989F39A49905d7C9C2FAc7799bDF', decimals: 6, notes: 'lzUSDC bridged' },
  { chain: 'fantom',     asset: 'USDT', address: 'none', decimals: 0, notes: 'No USDT via Squid on Fantom' },

  // ─── Fraxtal (252) ───
  { chain: 'fraxtal',    asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'frxETH native' },
  { chain: 'fraxtal',    asset: 'USDC', address: 'none', decimals: 0, notes: 'No USDC via Squid on Fraxtal' },
  { chain: 'fraxtal',    asset: 'USDT', address: 'none', decimals: 0, notes: 'No USDT via Squid on Fraxtal' },

  // ─── Gnosis (100) ───
  { chain: 'gnosis',     asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'xDAI native' },
  { chain: 'gnosis',     asset: 'USDC', address: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83', decimals: 6 },
  { chain: 'gnosis',     asset: 'USDT', address: '0x4ECaBa5870353805a9F068101A40E0f32eD605C6', decimals: 6 },

  // ─── Hedera (295) ───
  { chain: 'hedera',     asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 8, notes: 'HBAR native (8 decimals)' },
  { chain: 'hedera',     asset: 'USDC', address: '0x000000000000000000000000000000000006f89a', decimals: 6 },
  { chain: 'hedera',     asset: 'USDT', address: 'none', decimals: 0, notes: 'No USDT via Squid on Hedera' },

  // ─── Filecoin (314) ───
  { chain: 'filecoin',   asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'FIL native' },
  { chain: 'filecoin',   asset: 'USDC', address: 'none', decimals: 0, notes: 'No USDC via Squid on Filecoin' },
  { chain: 'filecoin',   asset: 'USDT', address: 'none', decimals: 0, notes: 'No USDT via Squid on Filecoin' },

  // ─── Immutable zkEVM (13371) ───
  { chain: 'immutable',  asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'IMX native' },
  { chain: 'immutable',  asset: 'USDC', address: '0x6de8aCC0D406837030CE4dd28e7c08C5a96a30d2', decimals: 6 },
  { chain: 'immutable',  asset: 'USDT', address: '0x68bCC7F1190AF20E7b572BCFb431c3ac10A936Ab', decimals: 6 },

  // ─── Kava EVM (2222) ───
  { chain: 'kava',       asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'KAVA native' },
  { chain: 'kava',       asset: 'USDC', address: 'none', decimals: 0, notes: 'No USDC via Squid on Kava EVM' },
  { chain: 'kava',       asset: 'USDT', address: 'none', decimals: 0, notes: 'No USDT via Squid on Kava EVM' },

  // ─── Moonbeam (1284) ───
  { chain: 'moonbeam',   asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'GLMR native' },
  { chain: 'moonbeam',   asset: 'USDC', address: 'none', decimals: 0, notes: 'No USDC via Squid on Moonbeam' },
  { chain: 'moonbeam',   asset: 'USDT', address: 'none', decimals: 0, notes: 'No USDT via Squid on Moonbeam' },

  // ─── Peaq (3338) ───
  { chain: 'peaq',       asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, notes: 'PEAQ native' },
  { chain: 'peaq',       asset: 'USDC', address: '0xbba60dA06c2C5424f03f7434542280FCAD453D10', decimals: 6 },
  { chain: 'peaq',       asset: 'USDT', address: '0xf4d9235269a96aAdaFc9adAE454a0618eBe37949', decimals: 6 },

  // ─── Soneium (1868) ───
  { chain: 'soneium',    asset: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  { chain: 'soneium',    asset: 'USDC', address: 'none', decimals: 0, notes: 'No USDC via Squid on Soneium yet' },
  { chain: 'soneium',    asset: 'USDT', address: '0x3A337a6ada9d885B6AD95eC48F9b75F197b5AE35', decimals: 6 },

  // ─── Sui ───
  { chain: 'sui',        asset: 'ETH',  address: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI', decimals: 9, notes: 'SUI native (mapped to ETH slot)' },
  { chain: 'sui',        asset: 'USDC', address: 'none', decimals: 0, notes: 'No USDC on Sui via Squid' },
  { chain: 'sui',        asset: 'USDT', address: 'none', decimals: 0, notes: 'No USDT on Sui via Squid' },

  // ─── Cosmos IBC chains — USDC/USDT addresses are IBC denoms from Squid token list ───

  // Osmosis (osmosis-1)
  { chain: 'osmosis',    asset: 'ETH',  address: 'uosmo', decimals: 6, notes: 'OSMO native (ETH asset slot = chain native token)' },
  { chain: 'osmosis',    asset: 'USDC', address: 'ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4', decimals: 6 },
  { chain: 'osmosis',    asset: 'USDT', address: 'ibc/4ABBEF4C8926DDDB320AE5188CFD63267ABBCEFC0583E4AE05D6E5AA2401DDAB', decimals: 6 },

  // Noble (noble-1) — canonical USDC issuance chain
  { chain: 'noble',      asset: 'ETH',  address: 'none', decimals: 0,  notes: 'No ETH on Noble' },
  { chain: 'noble',      asset: 'USDC', address: 'uusdc', decimals: 6, notes: 'Native Circle USDC on Noble' },
  { chain: 'noble',      asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Noble' },

  // Neutron (neutron-1)
  { chain: 'neutron',    asset: 'ETH',  address: 'untrn', decimals: 6, notes: 'NTRN native' },
  { chain: 'neutron',    asset: 'USDC', address: 'ibc/B559A80D62249C8AA07A380E2A2BEA6E5CA9A6F079C912C3A9E9B494105E4F81', decimals: 6 },
  { chain: 'neutron',    asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Neutron via Squid' },

  // DYDX (dydx-mainnet-1)
  { chain: 'dydx',       asset: 'ETH',  address: 'adydx', decimals: 18, notes: 'DYDX native' },
  { chain: 'dydx',       asset: 'USDC', address: 'ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5', decimals: 6 },
  { chain: 'dydx',       asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on DYDX via Squid' },

  // Sei (pacific-1)
  { chain: 'sei',        asset: 'ETH',  address: 'usei', decimals: 6, notes: 'SEI native' },
  { chain: 'sei',        asset: 'USDC', address: 'ibc/CA6FBFAF399474A06263E10D0CE5AEBBE15189D6D4B2DD9ADE61007E68EB9DB0', decimals: 6, notes: 'Noble USDC via IBC' },
  { chain: 'sei',        asset: 'USDT', address: 'ibc/6C00E4AA0CC7618370F81F7378638AE6C48EFF8C9203CE1C2357012B440EBDB7', decimals: 6 },

  // Cosmos Hub (cosmoshub-4)
  { chain: 'cosmoshub',  asset: 'ETH',  address: 'uatom', decimals: 6, notes: 'ATOM native' },
  { chain: 'cosmoshub',  asset: 'USDC', address: 'ibc/F663521BF1836B00F5F177680F74BFB9A8B5654A694D0D2BC249E03CF2509013', decimals: 6 },
  { chain: 'cosmoshub',  asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Cosmos Hub via Squid' },

  // Kujira (kaiyo-1)
  { chain: 'kujira',     asset: 'ETH',  address: 'ukuji', decimals: 6, notes: 'KUJI native' },
  { chain: 'kujira',     asset: 'USDC', address: 'ibc/FE98AAD68F02F03565E9FA39A5E627946699B2B07115889ED812D8BA639576A9', decimals: 6 },
  { chain: 'kujira',     asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Kujira via Squid' },

  // Terra (phoenix-1)
  { chain: 'terra',      asset: 'ETH',  address: 'uluna', decimals: 6, notes: 'LUNA native' },
  { chain: 'terra',      asset: 'USDC', address: 'ibc/2C962DAB9F57FE0921435426AE75196009FAA1981BF86991203C8411F8980FDB', decimals: 6 },
  { chain: 'terra',      asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Terra via Squid' },

  // Injective (injective-1) — uses .axl suffix for Axelar-bridged assets
  { chain: 'injective',  asset: 'ETH',  address: 'inj', decimals: 18, notes: 'INJ native' },
  { chain: 'injective',  asset: 'USDC', address: 'ibc/7E1AF94AD246BE522892751046F0C959B768642E5671CC3742264068D49553C0', decimals: 6, notes: 'USDC.axl' },
  { chain: 'injective',  asset: 'USDT', address: 'ibc/90C6F06139D663CFD7949223D257C5B5D241E72ED61EBD12FFDDA6F068715E47', decimals: 6, notes: 'USDT.axl' },

  // Stargaze (stargaze-1)
  { chain: 'stargaze',   asset: 'ETH',  address: 'ustars', decimals: 6, notes: 'STARS native' },
  { chain: 'stargaze',   asset: 'USDC', address: 'ibc/4A482FA914A4B9B05801ED81C33713899F322B24F76A06F4B8FE872485EA22FF', decimals: 6 },
  { chain: 'stargaze',   asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Stargaze via Squid' },

  // Juno (juno-1)
  { chain: 'juno',       asset: 'ETH',  address: 'ujuno', decimals: 6, notes: 'JUNO native' },
  { chain: 'juno',       asset: 'USDC', address: 'ibc/4A1C18CA7F50544760CF306189B810CE4C1CB156C7FC870143D401FE7280E591', decimals: 6 },
  { chain: 'juno',       asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Juno via Squid' },

  // Axelar (axelar-dojo-1)
  { chain: 'axelar',     asset: 'ETH',  address: 'uaxl', decimals: 6, notes: 'AXL native' },
  { chain: 'axelar',     asset: 'USDC', address: 'none', decimals: 0,  notes: 'No direct USDC IBC on Axelar via Squid' },
  { chain: 'axelar',     asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Axelar via Squid' },

  // Celestia (celestia)
  { chain: 'celestia',   asset: 'ETH',  address: 'utia', decimals: 6, notes: 'TIA native' },
  { chain: 'celestia',   asset: 'USDC', address: 'none', decimals: 0,  notes: 'No USDC on Celestia via Squid' },
  { chain: 'celestia',   asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Celestia via Squid' },

  // Dymension (dymension_1100-1)
  { chain: 'dymension',  asset: 'ETH',  address: 'adym', decimals: 18, notes: 'DYM native' },
  { chain: 'dymension',  asset: 'USDC', address: 'ibc/B3504E092456BA618CC28AC671A71FB08C6CA0FD0BE7C8A5B5A3E2DD933CC9E4', decimals: 6 },
  { chain: 'dymension',  asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Dymension via Squid' },

  // Stride (stride-1)
  { chain: 'stride',     asset: 'ETH',  address: 'ustrd', decimals: 6, notes: 'STRD native' },
  { chain: 'stride',     asset: 'USDC', address: 'none', decimals: 0,  notes: 'No USDC on Stride via Squid' },
  { chain: 'stride',     asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Stride via Squid' },

  // Agoric (agoric-3)
  { chain: 'agoric',     asset: 'ETH',  address: 'ubld', decimals: 6, notes: 'BLD native' },
  { chain: 'agoric',     asset: 'USDC', address: 'ibc/FE98AAD68F02F03565E9FA39A5E627946699B2B07115889ED812D8BA639576A9', decimals: 6 },
  { chain: 'agoric',     asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Agoric via Squid' },

  // Akash (akashnet-2)
  { chain: 'akash',      asset: 'ETH',  address: 'uakt', decimals: 6, notes: 'AKT native' },
  { chain: 'akash',      asset: 'USDC', address: 'none', decimals: 0,  notes: 'No USDC on Akash via Squid' },
  { chain: 'akash',      asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Akash via Squid' },

  // Archway (archway-1)
  { chain: 'archway',    asset: 'ETH',  address: 'aarch', decimals: 18, notes: 'ARCH native' },
  { chain: 'archway',    asset: 'USDC', address: 'ibc/43897B9739BD63E3A08A88191999C632E052724AB96BD4C74AE31375C991F48D', decimals: 6 },
  { chain: 'archway',    asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Archway via Squid' },

  // Xion (xion-mainnet-1)
  { chain: 'xion',       asset: 'ETH',  address: 'uxion', decimals: 6, notes: 'XION native' },
  { chain: 'xion',       asset: 'USDC', address: 'ibc/F082B65C88E4B6D5EF1DB243CDA1D331D002759E938A0F5CD3FFDC5D53B3E349', decimals: 6 },
  { chain: 'xion',       asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Xion via Squid' },

  // Elys (elys-1)
  { chain: 'elys',       asset: 'ETH',  address: 'uelys', decimals: 6, notes: 'ELYS native' },
  { chain: 'elys',       asset: 'USDC', address: 'ibc/F082B65C88E4B6D5EF1DB243CDA1D331D002759E938A0F5CD3FFDC5D53B3E349', decimals: 6 },
  { chain: 'elys',       asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Elys via Squid' },

  // Persistence (core-1)
  { chain: 'persistence',asset: 'ETH',  address: 'uxprt', decimals: 6, notes: 'XPRT native' },
  { chain: 'persistence',asset: 'USDC', address: 'ibc/B3792E4A62DF4A934EF2DF5968556DB56F5776ED25BDE11188A4F58A7DD406F0', decimals: 6 },
  { chain: 'persistence',asset: 'USDT', address: 'ibc/C559977F5797BDC1D74C0836A10C379C991D664166CB60D776A83029852431B4', decimals: 6 },

  // Saga (ssc-1)
  { chain: 'saga',       asset: 'ETH',  address: 'usaga', decimals: 6, notes: 'SAGA native' },
  { chain: 'saga',       asset: 'USDC', address: 'ibc/37EF240838413BD7D3496183213F7F0F483EC7A330328F16AD901A1AC1450F72', decimals: 6 },
  { chain: 'saga',       asset: 'USDT', address: 'ibc/B5F6DCC4FEF6BBBC356C67C46072AB3C01443FB5E3D19538C52A3CD439BE6BE3', decimals: 6 },

  // Migaloo (migaloo-1)
  { chain: 'migaloo',    asset: 'ETH',  address: 'uwhale', decimals: 6, notes: 'WHALE native' },
  { chain: 'migaloo',    asset: 'USDC', address: 'ibc/BC5C0BAFD19A5E4133FDA0F3E04AE1FBEE75A4A226554B2CBB021089FF2E1F8A', decimals: 6 },
  { chain: 'migaloo',    asset: 'USDT', address: 'none', decimals: 0,  notes: 'No USDT on Migaloo via Squid' },

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
