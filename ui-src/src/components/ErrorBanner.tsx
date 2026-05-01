import { AlertCircle, X, Terminal, FileCode, Code } from 'lucide-react';

interface ErrorBannerProps {
  error: {
    file: string;
    path: string;
    type: string;
    error: string;
    line: number | null;
    snippet: string;
  };
  onDismiss: () => void;
  onViewSource?: () => void;
}

export default function ErrorBanner({ error, onDismiss, onViewSource }: ErrorBannerProps) {
  return (
    <div style={{
      margin: '0 1.5rem 1.5rem 1.5rem',
      background: '#450a0a',
      border: '1px solid #991b1b',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
      animation: 'slideDown 0.3s cubic-bezier(0, 0.55, 0.45, 1)'
    }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1rem',
        background: '#7f1d1d',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        borderBottom: '1px solid #991b1b'
      }}>
        <AlertCircle size={18} color="#fca5a5" />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Fidelity Violation Detected
          </span>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
            {error.type}: {error.file} {error.line ? `(Line ${error.line})` : ''}
          </div>
        </div>
        {error.line && onViewSource && (
          <button
            onClick={onViewSource}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.7rem',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            <Code size={14} />
            View at Line {error.line}
          </button>
        )}
        <button 
          onClick={onDismiss}
          style={{ 
            background: 'rgba(255,255,255,0.1)', 
            border: 'none', 
            color: '#fca5a5', 
            padding: '4px', 
            borderRadius: '4px', 
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.8rem', color: '#fca5a5', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
          {error.error}
        </div>
        
        {error.snippet && (
          <div style={{ background: '#000', borderRadius: '4px', padding: '1rem', border: '1px solid #7f1d1d' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, opacity: 0.5 }}>
               <FileCode size={12} color="#fca5a5" />
               <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase' }}>Source Trace</span>
             </div>
             <pre style={{ 
               margin: 0, 
               fontSize: '0.75rem', 
               color: '#f8fafc', 
               fontFamily: "'JetBrains Mono', monospace",
               lineHeight: 1.6,
               whiteSpace: 'pre-wrap'
             }}>
               {error.snippet}
             </pre>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div style={{ 
        padding: '0.5rem 1rem', 
        background: 'rgba(0,0,0,0.2)', 
        fontSize: '0.6rem', 
        color: '#fca5a580', 
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }}>
        <Terminal size={12} />
        This module is currently disabled (502) until the syntax is corrected.
      </div>

      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
