import { X, CheckCircle, AlertCircle, FileCode, FileEdit, Code } from 'lucide-react';
import type { DistributionHook } from '../types';

interface StatusModalProps {
  hook: DistributionHook;
  error?: {
    file: string;
    path: string;
    type: string;
    error: string;
    line: number | null;
    snippet: string;
  };
  onClose: () => void;
  onViewSource?: (line: number | null) => void;
}

export default function StatusModal({ hook, error, onClose, onViewSource }: StatusModalProps) {
  const isHealthy = !error;
  const filename = hook.path.split(/[\\\/]/).pop() || '';

  const handleEdit = () => {
    fetch(`/api/open-editor?path=${encodeURIComponent(hook.path)}`);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99000,
      padding: '2rem'
    }} onClick={onClose}>
      <div 
        style={{
          width: '100%',
          maxWidth: '800px',
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          animation: 'modalScale 0.2s cubic-bezier(0, 0, 0.2, 1)'
        }} 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #30363d',
          background: isHealthy ? '#064e3b22' : '#7f1d1d22',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          {isHealthy ? (
            <CheckCircle size={24} color="#10b981" />
          ) : (
            <AlertCircle size={24} color="#ef4444" />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 900, color: isHealthy ? '#a7f3d0' : '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Hook Diagnostic Identity
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>
              {filename} <span style={{ opacity: 0.4, fontWeight: 400, marginLeft: 8 }}>[{hook.type}]</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
             <div>
                <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#484f58', textTransform: 'uppercase', marginBottom: 6 }}>Status</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                   <div style={{ width: 8, height: 8, borderRadius: '50%', background: isHealthy ? '#10b981' : '#ef4444', boxShadow: `0 0 8px ${isHealthy ? '#10b981' : '#ef4444'}88` }} />
                   <span style={{ fontSize: '0.9rem', fontWeight: 700, color: isHealthy ? '#10b981' : '#ef4444' }}>
                     {isHealthy ? 'Operational' : 'Critical Failure'}
                   </span>
                </div>
             </div>
             <div>
                <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#484f58', textTransform: 'uppercase', marginBottom: 6 }}>Stage</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#c9d1d9' }}>{hook.stage}</div>
             </div>
          </div>

          {!isHealthy && error && (
            <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: '8px', overflow: 'hidden' }}>
               <div style={{ padding: '0.75rem 1rem', background: '#7f1d1d44', borderBottom: '1px solid #991b1b', color: '#fca5a5', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'monospace' }}>
                  {error.error}
               </div>
               <div style={{ padding: '1rem', background: '#000' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, opacity: 0.5 }}>
                    <FileCode size={12} color="#fca5a5" />
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase' }}>Source Trace {error.line ? `(Line ${error.line})` : ''}</span>
                  </div>
                  <pre style={{ margin: 0, fontSize: '0.8rem', color: '#f8fafc', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {error.snippet}
                  </pre>
               </div>
            </div>
          )}

          {isHealthy && (
            <div style={{ padding: '1.5rem', border: '1px dashed #30363d', borderRadius: '8px', textAlign: 'center' }}>
               <div style={{ fontSize: '0.85rem', color: '#8b949e' }}>
                 No fidelity violations detected. Logic is verified and ready for traffic.
               </div>
            </div>
          )}

          <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#484f58' }}>
             Path: {hook.path}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '1.25rem 1.5rem', background: '#161b22', borderTop: '1px solid #30363d', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
           {error?.line != null && onViewSource && (
             <button
               onClick={() => { onViewSource(error.line); onClose(); }}
               style={{
                 display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 1.25rem',
                 background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)',
                 borderRadius: '6px', color: '#f97316', fontSize: '0.8rem', fontWeight: 600,
                 cursor: 'pointer'
               }}
             >
               <Code size={16} />
               View at Line {error.line}
             </button>
           )}
           <button
             onClick={handleEdit}
             style={{
               display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 1.25rem',
               background: '#238636', border: '1px solid rgba(240,246,252,0.1)',
               borderRadius: '6px', color: '#fff', fontSize: '0.8rem', fontWeight: 600,
               cursor: 'pointer'
             }}
           >
             <FileEdit size={16} />
             Edit in Editor
           </button>
           <button
             onClick={onClose}
             style={{
               padding: '0.6rem 1.25rem',
               background: 'transparent', border: '1px solid #30363d',
               borderRadius: '6px', color: '#c9d1d9', fontSize: '0.8rem', fontWeight: 600,
               cursor: 'pointer'
             }}
           >
             Close Diagnostics
           </button>
        </div>
      </div>
      <style>{`
        @keyframes modalScale {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
