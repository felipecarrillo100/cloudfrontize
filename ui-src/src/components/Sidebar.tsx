import HeaderIntelligence from './HeaderIntelligence';
import type { StickyHeader } from '../types';

interface SidebarProps {
  headers: StickyHeader[];
  isDirty: boolean;
  onApply: (headers: StickyHeader[]) => void;
  onReset: () => void;
  onUpdate: (headers: StickyHeader[]) => void;
  onShowAbout: () => void;
}

export default function Sidebar({ headers, isDirty, onApply, onReset, onUpdate, onShowAbout }: SidebarProps) {

  return (
    <aside style={{ width: 340, minWidth: 320, maxWidth: 380, borderRight: '1px solid #334155', background: '#1e293b', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo & Branding */}
        <div 
          onClick={onShowAbout}
          style={{ padding: '1.25rem 1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
        >
          <img src="/cloudfrontize-pro-transparent-512.png" alt="CloudFrontize PRO" style={{ width: 32, height: 32 }} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f97316', letterSpacing: '0.05em' }}>
              CLOUDFRONTIZE <span style={{ color: '#f8fafc' }}>PRO</span>
            </h1>
            <p style={{ margin: 0, fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Edge Command Center</p>
          </div>
        </div>

        {/* Panel Header: Intelligence */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem 1rem', borderTop: '1px solid #334155', borderBottom: '1px solid #334155', background: '#1e293b' }}>
           <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Header Intelligence</span>
        </div>

      <HeaderIntelligence 
        headers={headers} 
        isDirty={isDirty} 
        onApply={onApply} 
        onReset={onReset} 
        onUpdate={onUpdate} 
      />

      <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #334155', fontSize: '0.6rem', color: '#475569', display: 'flex', justifyContent: 'space-between', background: '#1e293b' }}>
        <span>© 2026 Felipe Carrillo</span>
        <span>v1.10.2</span>
      </div>
    </aside>
  );
}
