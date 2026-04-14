import React from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Eye, Files, Power, Target, Activity, ExternalLink } from 'lucide-react';
import type { DistributionHook } from '../types';
import { useDistribution } from '../contexts/DistributionContext';
import { useUI } from '../contexts/UIContext';

import lambdaIcon from '../assets/lambda-edge.png';
import cffIcon from '../assets/cloudfront-function.png';

export default function FidelityCloud() {
  const { dist, toggleHook, isolateHook } = useDistribution();
  const { openDetail, openCode } = useUI();

  if (!dist) return null;

  const vReq = (dist.hooks || []).filter(h => h.stage === 'viewer-request');
  const vRes = (dist.hooks || []).filter(h => h.stage === 'viewer-response');
  const oReq = (dist.hooks || []).filter(h => h.stage === 'origin-request');
  const oRes = (dist.hooks || []).filter(h => h.stage === 'origin-response');

  const buildStations = (reqs: DistributionHook[], ress: DistributionHook[]) => {
    const cffReqs = (reqs || []).filter(h => h.type.includes('CloudFront'));
    const edgeReqs = (reqs || []).filter(h => h.type.includes('Lambda'));
    const cffRess = (ress || []).filter(h => h.type.includes('CloudFront'));
    const edgeRess = (ress || []).filter(h => h.type.includes('Lambda'));
    const stations: { top?: DistributionHook, bottom?: DistributionHook }[] = [];
    const maxCff = Math.max(cffReqs.length, cffRess.length);
    for (let i = 0; i < maxCff; i++) stations.push({ top: cffReqs[i], bottom: cffRess[i] });
    const maxEdge = Math.max(edgeReqs.length, edgeRess.length);
    for (let i = 0; i < maxEdge; i++) stations.push({ top: edgeReqs[i], bottom: edgeRess[i] });
    return stations;
  };

  const viewerStations = buildStations(vReq, vRes);
  const originStations = buildStations(oReq, oRes);

  const ContextItem = ({ label, icon, onClick, color }: { label: string, icon: React.ReactNode, onClick: () => void, color?: string }) => (
    <ContextMenu.Item 
        onClick={onClick}
        style={{ 
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, 
            fontSize: '0.75rem', color: color || '#c9d1d9', cursor: 'pointer', outline: 'none' 
        }}
    >
        {icon}
        <span>{label}</span>
    </ContextMenu.Item>
  );

  const Node = ({ hook, color }: { hook: DistributionHook, color: string }) => {
    const filename = hook.path.split(/[\\\/]/).pop() || '';
    const isDisabled = (hook as any).disabled;
    const isCff = hook.type.toLowerCase().includes('function');
    const icon = isCff ? cffIcon : lambdaIcon;

    return (
        <ContextMenu.Root>
            <ContextMenu.Trigger>
                <div
                    title={hook.path}
                    className="fidelity-node"
                    style={{
                        padding: '6px 14px', borderRadius: 10, background: `${color}1A`, border: `1px solid ${color}4D`,
                        cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.4s', width: 160, height: 54, zIndex: 10, backdropFilter: 'blur(4px)',
                        boxShadow: `0 4px 12px ${color}11`, flexShrink: 0, overflow: 'hidden',
                        filter: isDisabled ? 'grayscale(1) brightness(0.6)' : 'none',
                        opacity: isDisabled ? 0.5 : 1, position: 'relative'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <img src={icon} alt={hook.type} style={{ width: 18, height: 18, objectFit: 'contain', filter: `drop-shadow(0 0 4px ${color}88)` }} />
                        <div style={{ fontSize: '0.42rem', fontWeight: 950, color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{hook.type} {isDisabled && '(BYPASSED)'}</div>
                    </div>
                    <div className="node-marquee-container" style={{ width: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'center' }}>
                        <div className="node-marquee-text" style={{ fontSize: '0.65rem', color: '#f8fafc', fontWeight: 800, display: 'inline-block', minWidth: '100%' }}>
                            {filename}
                        </div>
                    </div>
                </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
                <ContextMenu.Content 
                    style={{ 
                        minWidth: 160, background: '#161b22', borderRadius: 8, padding: 4, 
                        border: '1px solid #30363d', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 1200 
                    }}
                >
                    <ContextItem label="View Source" icon={<Eye size={14}/>} onClick={() => openCode(hook)} />
                    <ContextItem label="Copy Path" icon={<Files size={14}/>} onClick={() => navigator.clipboard.writeText(hook.path || '')} />
                    <ContextMenu.Separator style={{ height: 1, background: '#30363d', margin: '4px 0' }} />
                    <ContextItem 
                        label={isDisabled ? "Enable Hook" : "Disable Hook"} 
                        icon={<Power size={14}/>} 
                        onClick={() => toggleHook(hook.id || '', !isDisabled)} 
                    />
                    <ContextItem label="Isolate Logic" icon={<Target size={14}/>} onClick={() => isolateHook(hook.id || '')} />
                </ContextMenu.Content>
            </ContextMenu.Portal>
        </ContextMenu.Root>
    );
  };

  const HeroIcon = ({ emoji, label, color, size = 100, radius = "50%", type }: { emoji: string, label: string, color?: string, size?: number; radius?: string; type: 'viewer' | 'origin' | 'cloudfront' }) => {
    const port = dist.port || (dist as any).config?.port || 3000;
    const accessUrl = `http://localhost:${port}`;
    const rootDir = dist.mode === 'website' ? './www' : './';

    const handleInspectViewer = () => {
        openDetail("Viewer Ingress", "Edge Entry Point Configuration", { 
            url: accessUrl, mode: dist.mode, port, 
            fidelity: dist.mode === 'website' ? "S3 Website Hosting Mode" : "Standard API Mode",
            root: rootDir
        }, rootDir);
    };

    const handleInspectOrigin = () => {
        const origin = dist.origins[0];
        if (!origin) return;
        openDetail(`Origin: ${origin.id}`, "Operational Identity Audit", origin, origin.configFile || origin.directory || (origin.bucket ? `s3://${origin.bucket}` : null));
    };

    return (
        <ContextMenu.Root>
            <ContextMenu.Trigger>
                <div style={{ 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, alignSelf: 'center', 
                    minWidth: 80, flexShrink: 0, height: 128, justifyContent: 'center', marginTop: 20,
                    cursor: 'pointer'
                }}>
                    <div style={{
                        width: size, height: size, borderRadius: radius ? radius : '50%',
                        background: color || '#161b22', border: '2px solid #30363d',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: `${size * 0.5}px`, boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                    }}>
                        {emoji}
                    </div>
                    <span style={{ fontSize: '0.5rem', fontWeight: 950, color: '#484f58', letterSpacing: '0.1em' }}>{label}</span>
                </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
                <ContextMenu.Content 
                    style={{ 
                        minWidth: 160, background: '#161b22', borderRadius: 8, padding: 4, 
                        border: '1px solid #30363d', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 1200 
                    }}
                >
                    {type === 'viewer' && (
                        <>
                            <ContextItem label="Ingress Identity" icon={<Activity size={14}/>} onClick={handleInspectViewer} />
                            <ContextItem label="Open in Browser" icon={<ExternalLink size={14}/>} onClick={() => window.open(accessUrl, '_blank')} />
                            <ContextItem label="Copy Access URL" icon={<Files size={14}/>} onClick={() => navigator.clipboard.writeText(accessUrl)} />
                        </>
                    )}
                    {type === 'origin' && (
                        <>
                            <ContextItem label="Origin Identity" icon={<Activity size={14}/>} onClick={handleInspectOrigin} />
                            <ContextItem label="Copy Path" icon={<Files size={14}/>} onClick={() => {
                                 const origin = dist.origins[0];
                                 if (origin) navigator.clipboard.writeText(origin.directory || origin.bucket || '');
                            }} />
                            {dist.origins[0]?.configFile && (
                                <ContextItem label="Edit Configuration" icon={<ExternalLink size={14}/>} onClick={() => fetch(`/api/open-editor?path=${encodeURIComponent(dist.origins[0].configFile || '')}`)} />
                            )}
                        </>
                    )}
                    {type === 'cloudfront' && (
                        <ContextItem label="CloudFront Console" icon={<Activity size={14}/>} onClick={() => alert("Redirecting to Edge Controller...")} />
                    )}
                </ContextMenu.Content>
            </ContextMenu.Portal>
        </ContextMenu.Root>
    );
  };

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

  const ArrowPlaceholder = ({ color }: { color: string }) => (
    <div style={{ width: 160, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ width: '100%', height: 1, background: `${color}33`, borderRadius: 1 }} />
    </div>
  );

  const Slot = ({ topHook, bottomHook }: { topHook?: DistributionHook, bottomHook?: DistributionHook }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: 160, flexShrink: 0 }}>
        <div style={{ height: 54, display: 'flex', alignItems: 'center' }}>
            {topHook ? <Node hook={topHook} color="#f97316" /> : <ArrowPlaceholder color="#f97316" />}
        </div>
        <div style={{ height: 54, display: 'flex', alignItems: 'center' }}>
            {bottomHook ? <Node hook={bottomHook} color="#3b82f6" /> : <ArrowPlaceholder color="#3b82f6" />}
        </div>
    </div>
  );

  return (
    <div style={{
        padding: '1.5rem 2rem', background: '#0e1117', borderBottom: '1px solid #30363d',
        overflowX: 'auto', display: 'flex', alignItems: 'center', height: 180,
        scrollbarWidth: 'thin', scrollbarColor: '#30363d #0e1117', isolation: 'isolate'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', margin: '0 auto', minWidth: 'max-content', gap: 0 }}>
          <div style={{ cursor: 'default' }}>
            <HeroIcon emoji="📱" label="VIEWER" radius="12px" type="viewer" />
          </div>
          <Connector />
          {viewerStations.map((s, idx) => (
             <div key={`v-${idx}`} style={{ display: 'flex', alignItems: 'center' }}>
                 <Slot topHook={s.top} bottomHook={s.bottom} />
                 <Connector />
             </div>
          ))}
          <div style={{ cursor: 'default' }}>
            <HeroIcon emoji="☁️" label="CloudFront" size={62} color="linear-gradient(135deg, #f97316, #3b82f6)" type="cloudfront" />
          </div>
          <Connector />
          {originStations.map((s, idx) => (
             <div key={`o-${idx}`} style={{ display: 'flex', alignItems: 'center' }}>
                 <Slot topHook={s.top} bottomHook={s.bottom} />
                 <Connector />
             </div>
          ))}
          <div style={{ cursor: 'default' }}>
              <HeroIcon emoji="📦" label="ORIGIN" radius="12px" type="origin" />
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
}
