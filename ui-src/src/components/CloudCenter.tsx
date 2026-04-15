import FidelityCloud from './FidelityCloud';
import ToolbarDropdown from './ToolbarDropdown';
import { useDistribution } from '../contexts/DistributionContext';
import { Power, ShieldCheck, Layers } from 'lucide-react';

interface CloudCenterProps {
  onShowAudit: () => void;
}

/**
 * Architecture visualization center for the CloudFrontize dashboard.
 * 
 * @namespace Frontend
 * This component provides the top-level view of the CloudFront distribution 
 * architecture. It coordinates the global control toolbar (Disabling all hooks, 
 * Fidelity audits) and renders the interactive cloud topology.
 */
export default function CloudCenter({ onShowAudit }: CloudCenterProps) {
  const { dist, disableAllHooks } = useDistribution();

  if (!dist) return null;

  const handleAction = (id: string) => {
    if (id === 'show-audit') onShowAudit();
    if (id === 'disable-all') disableAllHooks(true);
    if (id === 'enable-all') disableAllHooks(false);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem 1rem', borderTop: '1px solid #334155', borderBottom: '1px solid #30363d', background: '#161b22', position: 'relative' }}>
        <Layers size={14} color="#f97316" />
        <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Distribution Pipeline</span>
        <div style={{ flex: 1 }} />
        <ToolbarDropdown
          label="Simulation Actions"
          align="right"
          items={[
            { id: 'enable-all', label: 'Enable All Hooks', icon: <Power size={12} color="#22c55e" /> },
            { id: 'disable-all', label: 'Disable All Hooks', icon: <Power size={12} color="#ef4444" /> },
            { isSeparator: true, id: 'sep', label: '' },
            { id: 'show-audit', label: 'AWS Fidelity Audit', icon: <ShieldCheck size={12} color="#f97316" /> }
          ]}
          onAction={handleAction}
        />
      </div>

        <div style={{ flex: 1, padding: '0.25rem 0' }}>
          <FidelityCloud />
        </div>
      </div>
  );
}
