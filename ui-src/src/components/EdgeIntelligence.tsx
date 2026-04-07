import { useMemo } from 'react';
import { Activity, ShieldAlert, BarChart3, PieChart } from 'lucide-react';
import type { RequestEntry } from '../types';

interface EdgeIntelligenceProps {
  requests: RequestEntry[];
}

export default function EdgeIntelligence({ requests }: EdgeIntelligenceProps) {
  const stats = useMemo(() => {
    if (requests.length === 0) return { count: 0, p50: 0, p90: 0, errorRate: 0 };

    const durations = requests
      .map(r => r.durationMs)
      .filter((d): d is number => d != null)
      .sort((a, b) => a - b);

    const getPercentile = (p: number) => {
      if (durations.length === 0) return 0;
      const idx = Math.floor((p / 100) * durations.length);
      return durations[Math.min(idx, durations.length - 1)];
    };

    const errors = requests.filter(r => r.isError || (r.status && r.status >= 400)).length;

    return {
      count: requests.length,
      p50: getPercentile(50),
      p90: getPercentile(90),
      errorRate: (errors / requests.length) * 100
    };
  }, [requests]);

  const PanelHeader = ({ title, icon: Icon, color }: { title: string; icon: any; color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem 1rem', borderBottom: '1px solid #334155', background: '#1e293b' }}>
      <Icon size={14} color={color} />
      <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}</span>
    </div>
  );

  const StatRow = ({ label, value, unit, color = '#f8fafc' }: { label: string; value: string | number; unit?: string; color?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
      <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
        {unit && <span style={{ fontSize: '0.55rem', color: '#475569', fontWeight: 700 }}>{unit}</span>}
      </div>
    </div>
  );

  return (
    <aside style={{ width: 240, minWidth: 240, borderLeft: '1px solid #334155', background: '#0f172a', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Panel 1: Session Stats */}
      <section style={{ borderBottom: '1px solid #1e293b' }}>
        <PanelHeader title="Session Statistics" icon={Activity} color="#3b82f6" />
        <div style={{ padding: '0.75rem 1.25rem' }}>
          <StatRow label="Total Requests" value={stats.count} />
          <StatRow label="Avg Latency (p50)" value={stats.p50.toFixed(1)} unit="ms" color="#22c55e" />
          <StatRow label="Tail Latency (p90)" value={stats.p90.toFixed(1)} unit="ms" color="#f97316" />
          <StatRow label="Error Rate" value={stats.errorRate.toFixed(1)} unit="%" color={stats.errorRate > 5 ? '#ef4444' : '#64748b'} />
        </div>
      </section>

      {/* Panel 2: Resource Distribution (Mockup) */}
      <section style={{ borderBottom: '1px solid #1e293b', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <PanelHeader title="Resource Metrics" icon={PieChart} color="#a855f7" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.3, padding: '2rem' }}>
           <PieChart size={32} color="#475569" style={{ marginBottom: 12 }} />
           <p style={{ margin: 0, fontSize: '0.6rem', color: '#475569', fontWeight: 800, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
             Contextual Analysis<br/>Incoming in v1.11
           </p>
        </div>
      </section>

      {/* Panel 3: Behavioral Analysis (Mockup) */}
      <section style={{ height: '30%' }}>
        <PanelHeader title="Outlier Analytics" icon={ShieldAlert} color="#f59e0b" />
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
           <BarChart3 size={24} color="#475569" style={{ marginBottom: 8 }} />
           <p style={{ margin: 0, fontSize: '0.55rem', color: '#475569', fontWeight: 700, textAlign: 'center' }}>
             Detecting anomalies across edge pillars...
           </p>
        </div>
      </section>

      {/* Footer Signature */}
      <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #1e293b', fontSize: '0.55rem', color: '#334155', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.1em', textAlign: 'center' }}>
        [ Edge Intelligence Hub ]
      </div>
    </aside>
  );
}
