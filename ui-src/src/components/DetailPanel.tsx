import { Activity, Shield } from 'lucide-react';

interface DetailPanelProps {
  title: string;
  subTitle: string;
  content: any;
  path?: string;
  onClose: () => void;
}

export default function DetailPanel({ title, subTitle, content, path, onClose }: DetailPanelProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'var(--pro-modal-overlay)',
        backdropFilter: 'blur(var(--pro-modal-blur))',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '50%',
          maxWidth: 800,
          background: 'var(--pro-modal-bg)',
          borderLeft: '1px solid var(--pro-modal-border)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
          animation: 'slideIn 0.3s ease-out'
        }}
      >
        <header style={{ padding: '1rem 1.5rem', background: 'var(--pro-modal-header)', borderBottom: '1px solid var(--pro-modal-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity size={18} color="#3b82f6" />
            </div>
            <div>
                <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--pro-text-main)' }}>{title}</h3>
                <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--pro-text-dim)' }}>{subTitle}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '1.5rem', transition: 'color 0.2s' }}>×</button>
        </header>

        <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', background: '#0d1117' }}>
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                 <Shield size={14} color="#22c55e" />
                 <span style={{ fontSize: '0.65rem', color: '#22c55e', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Forensic Identity Registry</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(content || {}).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: '#161b22', borderRadius: 8, border: '1px solid #30363d' }}>
                        <div style={{ width: 140, flexShrink: 0, fontSize: '0.6rem', color: '#8b949e', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', alignSelf: 'center' }}>
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        <div style={{ flex: 1, fontSize: '0.8rem', color: '#f8fafc', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {path && (
            <footer style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid var(--pro-modal-border)', color: '#484f58', fontSize: '0.65rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{path}</span>
                <span style={{ fontWeight: 800, color: '#f97316' }}>REAL-TIME IDENTITY</span>
            </footer>
        )}
      </div>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
