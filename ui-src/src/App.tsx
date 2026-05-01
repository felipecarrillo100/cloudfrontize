import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import CloudCenter from './components/CloudCenter';
import TrafficCenter from './components/TrafficCenter';
import EdgeIntelligence from './components/EdgeIntelligence';
import AboutModal from './components/AboutModal';
import CodeViewer from './components/CodeViewer';
import DetailPanel from './components/DetailPanel';
import FidelityAuditModal from './components/FidelityAuditModal';
import { UIProvider, useUI } from './contexts/UIContext';
import { DistributionProvider, useDistribution } from './contexts/DistributionContext';
import { HeaderProvider } from './contexts/HeaderContext';
import ErrorBanner from './components/ErrorBanner';
import StatusModal from './components/StatusModal';
import { Toaster } from 'sonner';
import { useEffect } from 'react';

/**
 * The root component of the CloudFrontize Forensic Dashboard.
 * 
 * @namespace Frontend
 * This component initializes the main layout, including the Sidebar, Header, 
 * CloudCenter (Architecture), and TrafficCenter (Live stream). It coordinates 
 * the unified context providers for UI state and Distribution data.
 */
function DashboardContent() {
  const { dist, buildErrors } = useDistribution();
  const ui = useUI();
  const [showAbout, setShowAbout] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  // Get first error for overlay
  const activeError = Object.values(buildErrors)[0];
  const [dismissedPath, setDismissedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!activeError || activeError.path !== dismissedPath) {
      setDismissedPath(null);
    }
  }, [activeError]);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', background: '#0e1117', color: '#f8fafc', fontFamily: "'Inter', -apple-system, sans-serif", overflow: 'hidden', position: 'relative' }}>
      

      <Sidebar
        onShowAbout={() => setShowAbout(true)}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Feature Area 1: Cloud Architecture & Emulation Control - CONTENT HEIGHT */}
          <section style={{ flexShrink: 0, padding: 0 }}>
            <CloudCenter onShowAudit={() => setShowAudit(true)} />
          </section>

          {/* Feature Area 2: Traffic Life-cycle & Forensic Stream - SCROLLABLE STREAM */}
          <section style={{ flex: 1, minHeight: 0, padding: 0, position: 'relative', overflow: 'hidden', display: 'flex' }}>
            <TrafficCenter />
          </section>
        </div>
      </main>

      {/* Right Sidebar: Real-time Diagnostics & Metrics */}
      <EdgeIntelligence />

      {/* Unified Forensic Modal System */}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {ui.activeCode && <CodeViewer {...ui.activeCode} onClose={ui.closeCode} />}
      {showAudit && <FidelityAuditModal hooks={dist?.hooks || []} onClose={() => setShowAudit(false)} />}
      {ui.activeStatusHook && (
        <StatusModal 
          hook={ui.activeStatusHook} 
          error={buildErrors[ui.activeStatusHook.path]} 
          onClose={ui.closeStatus} 
        />
      )}

      {/* Detail Transitions */}
      {ui.detailPanel && (
        <DetailPanel
          title={ui.detailPanel.title}
          subTitle={ui.detailPanel.subTitle}
          content={ui.detailPanel.content}
          path={ui.detailPanel.path}
          onClose={ui.closeDetail}
        />
      )}

      {/* Global Build Error Overlay (Vite-Style) */}
      {activeError && activeError.path !== dismissedPath && (
        <div style={{ 
          position: 'fixed', 
          top: 60, 
          left: '50%', 
          transform: 'translateX(-50%)', 
          zIndex: 999999, 
          width: 'calc(100% - 40px)', 
          maxWidth: 700,
          pointerEvents: 'none' // Allow clicking through the container except banner
        }}>
           <div style={{ pointerEvents: 'auto' }}>
              <ErrorBanner error={activeError} onDismiss={() => setDismissedPath(activeError.path)} />
           </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <UIProvider>
      <DistributionProvider>
        <HeaderProvider>
          <DashboardContent />

          <Toaster theme="dark" position="bottom-right" richColors />

          <style>{`
            @keyframes pulse {
              0% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4); }
              70% { box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
              100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
            }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            *::-webkit-scrollbar {
              width: 6px;
              height: 6px;
            }
            *::-webkit-scrollbar-track {
              background: #0d1117;
              border-radius: 4px;
            }
            *::-webkit-scrollbar-thumb {
              background: #30363d;
              border-radius: 4px;
            }
            *::-webkit-scrollbar-thumb:hover {
              background: #484f58;
            }
          `}</style>
        </HeaderProvider>
      </DistributionProvider>
    </UIProvider>
  );
}
