interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}

export function StatCard({ label, value, sub, accent = '#6CF9D8' }: StatCardProps) {
  return (
    <div style={{
      background: '#12121e',
      border: '1px solid #1e1e2e',
      borderRadius: 12,
      padding: '20px 24px',
      minWidth: 160,
      flex: 1,
    }}>
      <div style={{ fontSize: 12, color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}
