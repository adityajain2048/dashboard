import { StatCard } from '../components/StatCard';
import { formatUSD, formatNumber } from '../utils/format';
import type { EnrichedProtocol } from '../api/merge';
import type { EnsoAction, EnsoNetwork, EnsoStandardEntry } from '../api/enso';

interface HeroStatsProps {
  protocols: EnrichedProtocol[];
  networks: EnsoNetwork[];
  actions: EnsoAction[];
  standards: EnsoStandardEntry[];
}

export function HeroStats({ protocols, networks, actions, standards }: HeroStatsProps) {
  // Integration surface = total (protocol × action) pairs Enso supports
  const integrationPoints = standards.reduce((s, e) => s + e.actions.length, 0);

  // Protocol depth = avg actions supported per protocol
  const protocolsWithStandards = new Set(standards.map((e) => e.protocol.slug)).size;
  const avgDepth = protocolsWithStandards > 0 ? (integrationPoints / protocolsWithStandards).toFixed(1) : '0';

  // Routable volume = DEX + lending volume flowing through covered protocols
  // This is NOT Enso's TVL — it's the market they can route through
  const routableVol = protocols.reduce((s, p) => s + (p.volume24h ?? 0), 0);

  // Unique chains with at least one integration
  const activeChains = networks.filter((n) => n.isConnected).length;

  // Standard patterns (ERC4626, AaveV3, etc.) — Enso's integration moat
  const uniquePatterns = new Set(
    standards.flatMap((e) => e.actions.map((a) => a.name.split('_').slice(0, -1).join('_')))
  ).size;

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Context banner */}
      <div style={{
        background: '#0f1729',
        border: '1px solid #1e3a5f',
        borderRadius: 10,
        padding: '10px 16px',
        marginBottom: 16,
        fontSize: 12,
        color: '#60a5fa',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 14 }}>ℹ</span>
        <span>
          <strong>Enso holds no TVL.</strong> It's pure infrastructure — developers call Enso's API to generate
          calldata that executes through the underlying protocols. Metrics below measure{' '}
          <strong>integration coverage and routing volume</strong>, not protocol TVL.
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard
          label="Protocols Covered"
          value={formatNumber(protocols.length)}
          sub={`${protocolsWithStandards} with ABI patterns`}
          accent="#6CF9D8"
        />
        <StatCard
          label="Chains Live"
          value={String(activeChains)}
          sub="Active networks"
          accent="#7B61FF"
        />
        <StatCard
          label="Action Types"
          value={String(actions.length)}
          sub="DeFi operations"
          accent="#F59E0B"
        />
        <StatCard
          label="Integration Points"
          value={formatNumber(integrationPoints)}
          sub={`${avgDepth} actions / protocol avg`}
          accent="#EC4899"
        />
        <StatCard
          label="Standard Patterns"
          value={String(uniquePatterns)}
          sub="ERC4626, AaveV3, Uniswap…"
          accent="#8B5CF6"
        />
        <StatCard
          label="Ecosystem 24h Vol"
          value={formatUSD(routableVol)}
          sub="DEX + lending vol, protocols Enso routes"
          accent="#10B981"
        />
      </div>
    </div>
  );
}
