const DEX_RE = /swap|dex|amm|curve|uni(swap)?|sushi|pancake|camelot|velodrome|aerodrome|balancer|trader|joe|quick|spooky|solidly|maverick|syncswap|zyber|ramses|sterling|thena|dystopia|woofi|kyber/i;
const LENDING_RE = /lend|borrow|compound|aave|spark|morpho|iron|benqi|euler|silo|radiant|venus|seamless|exactly|clearpool|hifi|notional|flux|granary|uwu|agave|creamfi|liquity|alchemix|angle|fraxlend/i;
const LST_RE = /stake|lido|rocket|renzo|stader|liquid|eigenlayer|restake|kelp|ether\.fi|ethx|ankr|swell|steth|wsteth|cbeth|reth|frxeth|meth|ezeth|weeth/i;
const YIELD_RE = /yield|vault|yearn|beefy|pendle|convex|harvest|idle|enzyme|ribbon|opyn|polynomial|rage|buffer|gmx-blueberry|autocompound/i;
const GAUGE_RE = /farm|gauge|reward|incentive|stake.*lp|lp.*stake|bribes?|votium/i;
const DERIV_RE = /perp|deriv|gmx|orderly|synthetix|lyra|hegic|premia|kwenta|gains|mux|level|apex|hyperliquid|dydx|vertex/i;
const BRIDGE_RE = /bridge|cctp|ccip|across|stargate|hop|celer|relay|layerzero|wormhole|debridge|connext|axelar/i;

export const CATEGORIES = ['Lending', 'DEX / AMM', 'Liquid Staking', 'Yield Vault', 'Farm / Gauge', 'Derivatives', 'Bridge', 'Other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS: Record<Category, string> = {
  'Lending': '#3B82F6',
  'DEX / AMM': '#10B981',
  'Liquid Staking': '#F59E0B',
  'Yield Vault': '#8B5CF6',
  'Farm / Gauge': '#EC4899',
  'Derivatives': '#F97316',
  'Bridge': '#EF4444',
  'Other': '#6B7280',
};

export function inferCategory(slug: string, standards: string[], llamaCategory: string): Category {
  // Standards take priority
  for (const std of standards) {
    const s = std.toLowerCase();
    if (s.includes('lending') || s.includes('aave') || s.includes('compound')) return 'Lending';
    if (s.includes('erc4626') || s.includes('vault')) return 'Yield Vault';
    if (s.includes('lp') || s.includes('liquidity')) return 'DEX / AMM';
    if (s.includes('gauge')) return 'Farm / Gauge';
    if (s.includes('bridge')) return 'Bridge';
  }

  // llama category mapping
  const lc = llamaCategory.toLowerCase();
  if (lc === 'dexs' || lc === 'dex') return 'DEX / AMM';
  if (lc === 'lending') return 'Lending';
  if (lc === 'liquid staking') return 'Liquid Staking';
  if (lc === 'yield' || lc === 'yield aggregator') return 'Yield Vault';
  if (lc === 'derivatives') return 'Derivatives';
  if (lc === 'bridge') return 'Bridge';
  if (lc === 'farm') return 'Farm / Gauge';

  // Slug keyword matching
  const s = slug.toLowerCase();
  if (BRIDGE_RE.test(s)) return 'Bridge';
  if (LST_RE.test(s)) return 'Liquid Staking';
  if (DERIV_RE.test(s)) return 'Derivatives';
  if (LENDING_RE.test(s)) return 'Lending';
  if (GAUGE_RE.test(s)) return 'Farm / Gauge';
  if (YIELD_RE.test(s)) return 'Yield Vault';
  if (DEX_RE.test(s)) return 'DEX / AMM';

  return 'Other';
}
