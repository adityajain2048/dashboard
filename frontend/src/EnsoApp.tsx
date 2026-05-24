import { useState, useEffect } from 'react';
import {
  fetchEnsoProtocols,
  fetchEnsoNetworks,
  fetchEnsoActions,
  fetchEnsoStandards,
  buildStandardsSummary,
  buildStandardsMap,
} from './enso/api/enso';
import { fetchLlamaProtocols, fetchLlamaDexVolumes, fetchLlamaLendingVolumes } from './enso/api/defiLlama';
import { crossReference, computeCoverageGaps } from './enso/api/merge';
import type { EnrichedProtocol } from './enso/api/merge';
import type { EnsoAction, EnsoNetwork, EnsoStandardEntry, StandardSummary } from './enso/api/enso';
import type { LlamaProtocol } from './enso/api/defiLlama';
import { HeroStats } from './enso/views/HeroStats';
import { TVLLeaderboard } from './enso/views/TVLLeaderboard';
import { ChainBusiness } from './enso/views/ChainBusiness';
import { CategoryBreakdown } from './enso/views/CategoryBreakdown';
import { ChainHeatmap } from './enso/views/ChainHeatmap';
import { ActionCoverage } from './enso/views/ActionCoverage';
import { StandardsBreakdown } from './enso/views/StandardsBreakdown';
import { ProtocolCatalog } from './enso/views/ProtocolCatalog';
import { CoverageGaps } from './enso/views/CoverageGaps';

interface DashboardData {
  protocols: EnrichedProtocol[];
  networks: EnsoNetwork[];
  actions: EnsoAction[];
  standardEntries: EnsoStandardEntry[];
  standardSummaries: StandardSummary[];
  coverageGaps: LlamaProtocol[];
}

interface LoadStep { label: string; done: boolean; }

export function EnsoApp() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<LoadStep[]>([
    { label: 'Enso protocols', done: false },
    { label: 'Enso actions & standards', done: false },
    { label: 'DefiLlama TVL (~3k protocols)', done: false },
    { label: 'Volume data', done: false },
    { label: 'Cross-referencing', done: false },
  ]);

  function markStep(i: number) {
    setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, done: true } : s));
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ensoProtocols = await fetchEnsoProtocols();
        if (cancelled) return;
        markStep(0);

        const [networks, actions, standardEntries] = await Promise.all([
          fetchEnsoNetworks(),
          fetchEnsoActions(),
          fetchEnsoStandards(),
        ]);
        if (cancelled) return;
        markStep(1);

        const llamaProtocols = await fetchLlamaProtocols();
        if (cancelled) return;
        markStep(2);

        const [dexVols, lendingVols] = await Promise.all([
          fetchLlamaDexVolumes().catch(() => ({ protocols: [], total24h: 0, total7d: 0 })),
          fetchLlamaLendingVolumes().catch(() => ({ protocols: [], total24h: 0, total7d: 0 })),
        ]);
        if (cancelled) return;
        markStep(3);

        const standardsMap = buildStandardsMap(standardEntries);
        const standardSummaries = buildStandardsSummary(standardEntries);
        const enriched = crossReference(ensoProtocols, llamaProtocols, dexVols.protocols, lendingVols.protocols, standardsMap);
        const gaps = computeCoverageGaps(ensoProtocols, llamaProtocols);
        markStep(4);

        setData({ protocols: enriched, networks, actions, standardEntries, standardSummaries, coverageGaps: gaps });
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const doneCount = steps.filter((s) => s.done).length;
  const loadPct = Math.round((doneCount / steps.length) * 100);

  if (!data) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0a14', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter, -apple-system, sans-serif', gap: 24,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#6CF9D8', marginBottom: 4 }}>Enso Intelligence</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Aggregating business data…</div>
        </div>
        {error ? (
          <div style={{ color: '#EF4444', fontSize: 13, maxWidth: 420, textAlign: 'center', padding: 16, background: '#EF444411', borderRadius: 8, border: '1px solid #EF444433' }}>
            {error}
          </div>
        ) : (
          <div style={{ width: 340 }}>
            <div style={{ height: 4, background: '#1e1e2e', borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, #6CF9D8, #7B61FF)', borderRadius: 2, width: `${loadPct}%`, transition: 'width 0.6s ease' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    background: step.done ? '#6CF9D8' : i === doneCount ? '#7B61FF' : '#1e1e2e',
                    border: `2px solid ${step.done ? '#6CF9D8' : i === doneCount ? '#7B61FF' : '#2e2e4e'}`,
                    transition: 'all 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: '#0a0a14', fontWeight: 800,
                  }}>
                    {step.done ? '✓' : ''}
                  </span>
                  <span style={{ color: step.done ? '#6b7280' : i === doneCount ? '#e5e7eb' : '#374151' }}>{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', fontFamily: 'Inter, -apple-system, sans-serif', color: '#e5e7eb' }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid #1e1e2e', padding: '14px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, background: '#0a0a14dd',
        backdropFilter: 'blur(12px)', zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Back to bridge dashboard */}
          <a href="/" style={{
            display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none',
            color: '#4b5563', fontSize: 11, fontWeight: 500, padding: '4px 10px',
            border: '1px solid #1e1e2e', borderRadius: 6,
            transition: 'color 0.2s',
          }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#9ca3af')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#4b5563')}
          >
            ← Bridge Dashboard
          </a>

          <div style={{ width: 1, height: 20, background: '#1e1e2e' }} />

          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #6CF9D8 0%, #7B61FF 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: '#0a0a14', flexShrink: 0,
          }}>E</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e5e7eb', lineHeight: 1.1 }}>Enso Intelligence</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
              {data.protocols.length} protocols · {data.networks.filter((n) => n.isConnected).length} chains · {data.actions.length} action types
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#374151' }}>Enso API + DefiLlama · live</div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '28px 32px' }}>
        <HeroStats protocols={data.protocols} networks={data.networks} actions={data.actions} standards={data.standardEntries} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <CategoryBreakdown protocols={data.protocols} />
          <ActionCoverage actions={data.actions} standards={data.standardEntries} />
        </div>

        <TVLLeaderboard protocols={data.protocols} standards={data.standardEntries} />

        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, marginBottom: 20 }}>
          <ChainBusiness protocols={data.protocols} standards={data.standardEntries} />
          <StandardsBreakdown summaries={data.standardSummaries} />
        </div>

        <ChainHeatmap protocols={data.protocols} />
        <ProtocolCatalog protocols={data.protocols} />
        <CoverageGaps gaps={data.coverageGaps} />
      </div>

      <div style={{ borderTop: '1px solid #1e1e2e', padding: '14px 32px', textAlign: 'center', fontSize: 11, color: '#374151' }}>
        Data: Enso public API · DefiLlama · Volume figures are ecosystem-level (protocols Enso routes), not Enso's own volume · Not financial advice
      </div>
    </div>
  );
}
