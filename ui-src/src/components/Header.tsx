import { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import { useDistribution } from '../contexts/DistributionContext';

export default function Header() {
  const [rps, setRps] = useState(0);
  const { lastEventId } = useDistribution();

  useEffect(() => {
    if (lastEventId > 0) {
      setRps(prev => prev + 1);
      setTimeout(() => setRps(p => Math.max(0, p - 1)), 1000);
    }
  }, [lastEventId]);

  return (
    <header style={{
      height: 64,
      background: '#161b22',
      borderBottom: '1px solid #30363d',
      display: 'flex',
      alignItems: 'center',
      padding: '0 1.5rem',
      gap: '1rem',
      flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1rem', fontWeight: 800, color: '#f97316', letterSpacing: '0.02em' }}>
          CLOUDFRONTIZE <span style={{ color: '#fff' }}>PRO</span>
        </span>

        <div
          title="Requests Per Second (Real-time Live Traffic)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(34,197,94,0.1)',
            padding: '2px 10px',
            borderRadius: 12,
            border: '1px solid rgba(34,197,94,0.2)',
            cursor: 'default'
          }}
        >
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#22c55e',
            boxShadow: '0 0 8px #22c55e',
            animation: 'pulse 2s infinite'
          }} />
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#22c55e' }}>{rps} RPS</span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8b949e', fontSize: '0.65rem', fontWeight: 700 }}>
             <Activity size={14} color="#f97316" />
             <span style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Visual Control Plane</span>
        </div>
      </div>
    </header>
  );
}
