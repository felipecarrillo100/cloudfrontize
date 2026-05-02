import HeaderIntelligence from './HeaderIntelligence';

interface SidebarProps {
  onShowAbout: () => void;
}

export default function Sidebar({ onShowAbout }: SidebarProps) {
  return (
    <aside style={{ 
      width: 320, 
      minWidth: 320, 
      maxWidth: 320, 
      borderRight: '1px solid #30363d', 
      background: '#0d1117', 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%' 
    }}>
      {/* Logo & Branding */}
      <div 
        onClick={onShowAbout}
        style={{ padding: '1.25rem 1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
      >
        <div style={{ padding: '2px', background: 'linear-gradient(45deg, #f97316, #3b82f6)', borderRadius: 8 }}>
            <div style={{ background: '#0d1117', borderRadius: 6, padding: 4 }}>
                <img src="/cloudfrontize-pro-transparent-512.png" alt="CloudFrontize PRO" style={{ width: 28, height: 28 }} />
            </div>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#f97316', letterSpacing: '0.05em' }}>
            CLOUDFRONTIZE <span style={{ color: '#f8fafc' }}>PRO</span>
          </h1>
          <p style={{ margin: 0, fontSize: '0.6rem', color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Edge Command Center</p>
        </div>
      </div>

      {/* Panel Header: Intelligence */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem 1rem', borderTop: '1px solid #30363d', borderBottom: '1px solid #30363d', background: '#161b22' }}>
         <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Header Intelligence</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <HeaderIntelligence />
      </div>

      <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #30363d', fontSize: '0.6rem', color: '#484f58', display: 'flex', justifyContent: 'space-between', background: '#0d1117' }}>
        <span style={{ fontWeight: 600 }}>© 2026 Felipe Carrillo</span>
        <span style={{ fontWeight: 700, color: '#f97316' }}>v1.10.2</span>
      </div>
    </aside>
  );
}
