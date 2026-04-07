import type { DistributionInfo, DistributionHook } from '../types';

interface FidelityCloudProps {
  dist: DistributionInfo | null;
  onContextMenu: (e: React.MouseEvent, hook: DistributionHook) => void;
}

export default function FidelityCloud({ dist, onContextMenu }: FidelityCloudProps) {
  if (!dist) return null;

  const vReq = dist.hooks.filter(h => h.stage === 'viewer-request');
  const vRes = dist.hooks.filter(h => h.stage === 'viewer-response');
  const oReq = dist.hooks.filter(h => h.stage === 'origin-request');
  const oRes = dist.hooks.filter(h => h.stage === 'origin-response');

  const buildStations = (reqs: DistributionHook[], ress: DistributionHook[]) => {
    const cffReqs = reqs.filter(h => h.type.includes('CloudFront'));
    const edgeReqs = reqs.filter(h => h.type.includes('Lambda'));
    const cffRess = ress.filter(h => h.type.includes('CloudFront'));
    const edgeRess = ress.filter(h => h.type.includes('Lambda'));
    const stations: { top?: DistributionHook, bottom?: DistributionHook }[] = [];
    const maxCff = Math.max(cffReqs.length, cffRess.length);
    for (let i = 0; i < maxCff; i++) stations.push({ top: cffReqs[i], bottom: cffRess[i] });
    const maxEdge = Math.max(edgeReqs.length, edgeRess.length);
    for (let i = 0; i < maxEdge; i++) stations.push({ top: edgeReqs[i], bottom: edgeRess[i] });
    return stations;
  };

  const viewerStations = buildStations(vReq, vRes);
  const originStations = buildStations(oReq, oRes);

  const Node = ({ hook, color }: { hook: DistributionHook, color: string }) => {
    const filename = hook.path.split(/[\\\/]/).pop() || '';
    const isDisabled = (hook as any).disabled;

    return (
        <div 
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, hook); }}
            title={hook.path}
            className="fidelity-node"
            style={{ 
                padding: '6px 14px', borderRadius: 10, background: `${color}1A`, border: `1px solid ${color}4D`, 
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.4s', width: 140, height: 54, zIndex: 10, backdropFilter: 'blur(4px)',
                boxShadow: `0 4px 12px ${color}11`, flexShrink: 0, overflow: 'hidden',
                filter: isDisabled ? 'grayscale(1) brightness(0.6)' : 'none',
                opacity: isDisabled ? 0.5 : 1
            }}
        >
            <div style={{ fontSize: '0.42rem', fontWeight: 950, color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{hook.type} {isDisabled && '(BYPASSED)'}</div>
            <div className="node-marquee-container" style={{ width: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'center' }}>
                <div className="node-marquee-text" style={{ fontSize: '0.65rem', color: '#f8fafc', fontWeight: 800, display: 'inline-block', minWidth: '100%' }}>
                    {filename}
                </div>
            </div>
            <style>{`
                .fidelity-node:hover .node-marquee-text {
                    animation: node-marquee 4s linear infinite;
                    padding-left: 100%;
                }
                @keyframes node-marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-100%); }
                }
            `}</style>
        </div>
    );
  };

  const ArrowPlaceholder = ({ color }: { color: string }) => (
    <div style={{ width: 140, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ width: '100%', height: 1, background: `${color}33`, borderRadius: 1 }} />
    </div>
  );

  const Connector = () => (
    <div style={{ width: 30, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ width: '100%', position: 'relative', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', height: 1, background: '#f9731633' }} />
            <div style={{ position: 'absolute', right: -1, color: '#f97316', fontSize: '0.65rem', transform: 'translateY(-0.5px)' }}>▶</div>
        </div>
        <div style={{ width: '100%', position: 'relative', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', height: 1, background: '#3b82f633' }} />
            <div style={{ position: 'absolute', left: -1, color: '#3b82f6', fontSize: '0.65rem', transform: 'translateY(-0.5px)' }}>◀</div>
        </div>
    </div>
  );

  const Slot = ({ topHook, bottomHook }: { topHook?: DistributionHook, bottomHook?: DistributionHook }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: 140, flexShrink: 0 }}>
        <div style={{ height: 54, display: 'flex', alignItems: 'center' }}>
            {topHook ? <Node hook={topHook} color="#f97316" /> : <ArrowPlaceholder color="#f97316" />}
        </div>
        <div style={{ height: 54, display: 'flex', alignItems: 'center' }}>
            {bottomHook ? <Node hook={bottomHook} color="#3b82f6" /> : <ArrowPlaceholder color="#3b82f6" />}
        </div>
    </div>
  );

  const HeroIcon = ({ emoji, label, color, size = 52 }: { emoji: string, label: string, color?: string, size?: number }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, alignSelf: 'center', minWidth: 80, flexShrink: 0, height: 128, justifyContent: 'center' }}>
        <div style={{ 
            width: size, height: size, borderRadius: emoji === '📦' ? 12 : '50%',
            background: color || '#161b22', border: '2px solid #30363d', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontSize: `${size * 0.5}px`, boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
        }}>
            {emoji}
        </div>
        <span style={{ fontSize: '0.45rem', fontWeight: 950, color: '#484f58', letterSpacing: '0.12em' }}>{label}</span>
    </div>
  );

  return (
    <div style={{ 
        padding: '1.5rem 2rem', background: '#0e1117', borderBottom: '1px solid #30363d', 
        overflowX: 'auto', display: 'flex', alignItems: 'center', height: 180,
        scrollbarWidth: 'thin', scrollbarColor: '#30363d #0e1117', isolation: 'isolate'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', margin: '0 auto', minWidth: 'max-content', gap: 0 }}>
          <HeroIcon emoji="📱" label="VIEWER" />
          <Connector />
          {viewerStations.map((s, idx) => (
             <div key={`v-${idx}`} style={{ display: 'flex', alignItems: 'center' }}>
                 <Slot topHook={s.top} bottomHook={s.bottom} />
                 <Connector />
             </div>
          ))}
          <HeroIcon emoji="☁️" label="PRO DIST" size={62} color="linear-gradient(135deg, #f97316, #3b82f6)" />
          <Connector />
          {originStations.map((s, idx) => (
             <div key={`o-${idx}`} style={{ display: 'flex', alignItems: 'center' }}>
                 <Slot topHook={s.top} bottomHook={s.bottom} />
                 <Connector />
             </div>
          ))}
          <div style={{ cursor: 'default' }}>
              <HeroIcon emoji="📦" label="ORIGIN" />
          </div>
      </div>
    </div>
  );
}
