export const BRIDGE_META: Record<string, { name: string; color: string; inAggregators: string[]; hasDirect: boolean }> = {
  across:    { name: 'Across',      color: '#6CF9D8', inAggregators: ['LI.FI', 'Rango', 'Bungee', 'Rubic'], hasDirect: true },
  stargate:  { name: 'Stargate',    color: '#FFD700', inAggregators: ['LI.FI', 'Rango', 'Bungee', 'Rubic'], hasDirect: true },
  relay:     { name: 'Relay',       color: '#FF6B6B', inAggregators: ['LI.FI', 'Rubic'], hasDirect: true },
  debridge:  { name: 'deBridge',    color: '#9945FF', inAggregators: ['LI.FI', 'Rango', 'Rubic'], hasDirect: true },
  symbiosis: { name: 'Symbiosis',   color: '#34D399', inAggregators: ['LI.FI', 'Rango', 'Rubic'], hasDirect: true },
  hop:       { name: 'Hop',         color: '#A78BFA', inAggregators: ['LI.FI', 'Bungee'], hasDirect: true },
  cbridge:   { name: 'cBridge',     color: '#F472B6', inAggregators: ['LI.FI', 'Rango', 'Bungee'], hasDirect: true },
  orbiter:   { name: 'Orbiter',     color: '#60A5FA', inAggregators: ['LI.FI', 'Rango'], hasDirect: true },
  mayan:     { name: 'Mayan',       color: '#F59E0B', inAggregators: ['Rango', 'Rubic'], hasDirect: true },
  meson:     { name: 'Meson',       color: '#00E5FF', inAggregators: ['Rango'], hasDirect: true },
  everclear: { name: 'Everclear',   color: '#627EEA', inAggregators: ['LI.FI'], hasDirect: true },
  thorchain: { name: 'THORChain',   color: '#0098EA', inAggregators: ['Rango'], hasDirect: true },
  wormhole:  { name: 'Wormhole',    color: '#8247E5', inAggregators: ['LI.FI', 'Rango', 'Bungee', 'Rubic'], hasDirect: false },
  cctp:      { name: 'CCTP',        color: '#2775CA', inAggregators: ['LI.FI', 'Rango', 'Bungee'], hasDirect: false },
  allbridge: { name: 'Allbridge',   color: '#EC796B', inAggregators: ['LI.FI', 'Rango'], hasDirect: false },
  chainflip: { name: 'Chainflip',   color: '#1DB954', inAggregators: ['Rango'], hasDirect: false },
  garden:    { name: 'Garden',      color: '#804A26', inAggregators: [], hasDirect: false },
  hyperlane: { name: 'Hyperlane',   color: '#E5E5E5', inAggregators: ['LI.FI', 'Rango', 'Bungee'], hasDirect: false },
  squid:     { name: 'Squid',       color: '#00D4FF', inAggregators: ['LI.FI', 'Rango'], hasDirect: false },
  synapse:   { name: 'Synapse',     color: '#B45EFF', inAggregators: ['Bungee'], hasDirect: false },
  gaszip:    { name: 'GasZip',      color: '#88FF88', inAggregators: ['LI.FI'], hasDirect: false },
  near:      { name: 'NEAR',        color: '#00C1DE', inAggregators: [], hasDirect: false },
  glacis:    { name: 'Glacis',      color: '#7B61FF', inAggregators: [], hasDirect: false },
  polymer:   { name: 'Polymer',     color: '#FF4081', inAggregators: [], hasDirect: false },
  eco:       { name: 'Eco',         color: '#4CAF50', inAggregators: [], hasDirect: false },
  bridgers:  { name: 'Bridgers',    color: '#FF9800', inAggregators: ['Rubic'], hasDirect: false },
};

export function getBridgeName(slug: string): string {
  return BRIDGE_META[slug]?.name ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function getBridgeColor(slug: string): string {
  return BRIDGE_META[slug]?.color ?? '#666';
}
