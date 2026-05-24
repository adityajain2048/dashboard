export function formatUSD(value: number, compact = true): string {
  if (value === 0) return '—';
  if (compact) {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

export function formatNumber(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return String(value);
}

export function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const CHAIN_DISPLAY: Record<string, string> = {
  ethereum: 'Ethereum',
  arbitrum: 'Arbitrum',
  optimism: 'Optimism',
  base: 'Base',
  polygon: 'Polygon',
  avalanche: 'Avalanche',
  binance: 'BNB Chain',
  gnosis: 'Gnosis',
  linea: 'Linea',
  zksync: 'zkSync',
  unichain: 'Unichain',
  sonic: 'Sonic',
  berachain: 'Berachain',
  world: 'World',
  monad: 'Monad',
  soneium: 'Soneium',
  sei: 'Sei',
  ink: 'Ink',
  plume: 'Plume',
};

export function formatChain(name: string): string {
  return CHAIN_DISPLAY[name.toLowerCase()] ?? name.charAt(0).toUpperCase() + name.slice(1);
}
