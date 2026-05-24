import { formatChain } from '../utils/format';

const CHAIN_COLORS: Record<string, string> = {
  ethereum: '#627EEA',
  arbitrum: '#28A0F0',
  optimism: '#FF0420',
  base: '#0052FF',
  polygon: '#8247E5',
  avalanche: '#E84142',
  binance: '#F0B90B',
  gnosis: '#048A81',
  linea: '#61DFFF',
  zksync: '#8C8DFC',
  sonic: '#F97316',
  berachain: '#D97706',
};

interface ChainBadgeProps {
  name: string;
  small?: boolean;
}

export function ChainBadge({ name, small = false }: ChainBadgeProps) {
  const color = CHAIN_COLORS[name.toLowerCase()] ?? '#6b7280';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: `${color}1a`,
      border: `1px solid ${color}44`,
      borderRadius: 6,
      padding: small ? '1px 6px' : '2px 8px',
      fontSize: small ? 10 : 11,
      color,
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}>
      {formatChain(name)}
    </span>
  );
}
