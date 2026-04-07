import type { DistributionHook } from '../types';

interface CodeViewerProps {
  hook: DistributionHook;
  onClose: () => void;
}

export default function CodeViewer({ hook, onClose }: CodeViewerProps) {
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
        }}
      >
        <header style={{ padding: '1rem 1.5rem', background: 'var(--pro-modal-header)', borderBottom: '1px solid var(--pro-modal-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '1rem' }}>⚡</span>
            </div>
            <div>
                <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--pro-text-main)' }}>{hook.path.split(/[\\\/]/).pop()}</h3>
                <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--pro-text-dim)' }}>{hook.type} Hook • Read Only</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '1.5rem' }}>×</button>
        </header>

        <div style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
            <pre 
                style={{ 
                    margin: 0, 
                    fontSize: '0.85rem', 
                    fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", 
                    lineHeight: 1.6, 
                    color: '#c9d1d9',
                    whiteSpace: 'pre-wrap',
                }}
            >
                {hook.code}
            </pre>
        </div>

        <footer style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid var(--pro-modal-border)', color: '#484f58', fontSize: '0.65rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>{hook.path}</span>
            <span>Hot reload active (IDE mirrored)</span>
        </footer>
      </div>
    </div>
  );
}
