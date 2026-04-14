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
import type { RequestEntry } from './types';

function DashboardContent() {
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const { dist } = useDistribution();
  const ui = useUI();
  const [showAbout, setShowAbout] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', background: '#0e1117', color: '#f8fafc', fontFamily: "'Inter', -apple-system, sans-serif", overflow: 'hidden' }}>
      <Sidebar
        onShowAbout={() => setShowAbout(true)}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Feature Area 1: Cloud Architecture & Emulation Control - FIXED HEIGHT WORKSTATION */}
          <section style={{ height: 280, flexShrink: 0, padding: 0 }}>
            <CloudCenter onShowAudit={() => setShowAudit(true)} />
          </section>

          {/* Feature Area 2: Traffic Life-cycle & Forensic Stream - SCROLLABLE STREAM */}
          <section style={{ flex: 1, minHeight: 0, padding: 0, position: 'relative', overflow: 'hidden', display: 'flex' }}>
            <TrafficCenter
              requests={requests}
              setRequests={setRequests}
            />
          </section>
        </div>
      </main>

      {/* Right Sidebar: Real-time Diagnostics & Metrics */}
      <EdgeIntelligence requests={requests} />

      {/* Unified Forensic Modal System */}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {ui.activeHook && <CodeViewer hook={ui.activeHook} onClose={ui.closeCode} />}
      {showAudit && <FidelityAuditModal hooks={dist?.hooks || []} onClose={() => setShowAudit(false)} />}

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
    </div>
  );
}

export default function App() {
  return (
    <UIProvider>
      <DistributionProvider>
        <HeaderProvider>
          <DashboardContent />

          <style>{`
            @keyframes pulse {
              0% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4); }
              70% { box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
              100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
            }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            .header-box::-webkit-scrollbar {
              width: 8px;
            }
            .header-box::-webkit-scrollbar-track {
              background: #0d1117;
              border-radius: 4px;
            }
            .header-box::-webkit-scrollbar-thumb {
              background: #30363d;
              border-radius: 4px;
            }
            .header-box::-webkit-scrollbar-thumb:hover {
              background: #484f58;
            }
          `}</style>
        </HeaderProvider>
      </DistributionProvider>
    </UIProvider>
  );
}
