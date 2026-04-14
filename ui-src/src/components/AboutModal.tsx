interface AboutModalProps {
  onClose: () => void;
}

export default function AboutModal({ onClose }: AboutModalProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--pro-modal-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(var(--pro-modal-blur))',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--pro-modal-bg)',
          border: '1px solid var(--pro-modal-border)',
          borderRadius: 24,
          padding: '2.5rem',
          maxWidth: 480,
          width: '90%',
          position: 'relative',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Hero Section */}
        <img 
            src="/cloudfrontize-pro-transparent-512.png" 
            alt="CloudFrontize PRO" 
            style={{ width: 120, height: 120, marginBottom: '1.5rem', filter: 'drop-shadow(0 0 16px rgba(249,115,22,0.3))' }} 
        />
        
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#f97316' }}>CloudFrontize <span style={{ color: 'var(--pro-text-main)' }}>PRO</span></h2>
        <p style={{ margin: '0.5rem 0 1.5rem', fontSize: '0.9rem', color: 'var(--pro-text-dim)', fontWeight: 500 }}>High-Fidelity Edge Console v1.10.2</p>

        <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#94a3b8', marginBottom: '2rem' }}>
          Accelerate your Lambda@Edge and CloudFront Function development with the ultimate local simulator. 
          Built for performance, tuned for fidelity.
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: '2rem' }}>
          {['Edge Runtime', 'Header Intelligence', 'Fidelity Visualizer'].map(p => (
            <span key={p} style={{ padding: '4px 12px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 600, background: 'rgba(249,115,22,0.1)', color: '#f97316', border: '1px solid rgba(249,115,22,0.2)' }}>{p}</span>
          ))}
        </div>

        <div style={{ padding: '0.75rem', borderRadius: 12, background: 'rgba(0,0,0,0.2)', marginBottom: '1rem' }}>
            <a href="https://github.com/felipecarrillo100/cloudfrontize" target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>
                🔗 Project Repository
            </a>
        </div>

        <p style={{ fontSize: '0.7rem', color: '#475569', margin: 0 }}>© 2026 Felipe Carrillo. Built on Paws & Pixels.</p>
        
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
      </div>
    </div>
  );
}
