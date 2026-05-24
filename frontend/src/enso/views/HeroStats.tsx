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
  // Integration surface
  const integrationPoints = standards.reduce((s, e) => s + e.actions.length, 0);
  const protocolsWithStandards = new Set(standards.map((e) => e.protocol.slug)).size;
  const avgDepth = protocolsWithStandards > 0 ? (integrationPoints / protocolsWithStandards).toFixed(1) : '0';

  // Chains
  const activeChains = networks.filter((n) => n.isConnected).length;

  // Standard patterns (ERC4626, AaveV3, etc.)
  const uniquePatterns = new Set(
    standards.flatMap((e) => e.actions.map((a) => a.name.split('_').slice(0, -1).join('_')))
  ).size;

  // Addressable TVL = sum of tvl in all DefiLlama-matched protocols Enso covers
  const addressableTvl = protocols.reduce((s, p) => s + (p.tvl ?? 0), 0);

  // Routable volume split by category
  const dexVol = protocols
    .filter((p) => p.category === 'DEX / AMM')
    .reduce((s, p) => s + (p.volume24h ?? 0), 0);

  const lendingVol = protocols
    .filter((p) => p.category === 'Lending')
    .reduce((s, p) => s + (p.volume24h ?? 0), 0);

  const totalVol = protocols.reduce((s, p) => s + (p.volume24h ?? 0), 0);

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
          calldata that executes through underlying protocols.{' '}
          <strong>Addressable TVL</strong> = total TVL locked in protocols Enso can route through.{' '}
          <strong>Ecosystem volume</strong> = trading/lending volume in those same protocols.
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
          label="Integration Points"
          value={formatNumber(integrationPoints)}
          sub={`${avgDepth} actions / protocol avg`}
          accent="#EC4899"
        />
        <StatCard
          label="Addressable TVL"
          value={formatUSD(addressableTvl)}
          sub="TVL locked in covered protocols"
          accent="#6CF9D8"
        />
        <StatCard
          label="DEX Ecosystem Vol 24h"
          value={formatUSD(dexVol)}
          sub={`of ${formatUSD(totalVol)} total routable vol`}
          accent="#10B981"
        />
        <StatCard
          label="Lending Ecosystem Vol 24h"
          value={formatUSD(lendingVol)}
          sub="Borrow/repay flows in covered protocols"
          accent="#3B82F6"
        />
        <StatCard
          label="Action Types"
          value={String(actions.length)}
          sub={`${uniquePatterns} ABI patterns`}
          accent="#F59E0B"
        />
      </div>
    </div>
  );
}
