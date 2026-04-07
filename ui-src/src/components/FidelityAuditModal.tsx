import {
  ShieldAlert, ExternalLink, X,
  ClipboardList, AlertTriangle, Info, ShieldCheck
} from 'lucide-react';
import type { DistributionHook } from '../types';
import { AWS_LINKS } from '../aws-documentation';

interface RoadmapTask {
  id: string;
  type: 'GAP' | 'BLOCKER';
  category: 'CONSOLE' | 'CODE' | 'INFRA';
  title: string;
  description: string;
  docsUrl?: string;
}

interface RoadmapRule {
  pattern: RegExp;
  task: RoadmapTask;
}

const ROADMAP_RULES: RoadmapRule[] = [
  {
    pattern: /request\.cookies|cookies\[/i,
    task: {
      id: 'cookies',
      type: 'GAP',
      category: 'CONSOLE',
      title: 'Cookie Logic Detected',
      description: 'Your logic relies on pre-parsed cookies. By default, AWS CloudFront does not forward cookies to edge functions.',
      docsUrl: AWS_LINKS.DOCS.COOKIES
    }
  },
  {
    pattern: /request\.querystring|querystring\[/i,
    task: {
      id: 'query',
      type: 'GAP',
      category: 'CONSOLE',
      title: 'Query String Logic Detected',
      description: 'Query parameters detected in logic. By default, AWS CloudFront strips query strings from the cache key.',
      docsUrl: AWS_LINKS.DOCS.QUERIES
    }
  },
  {
    pattern: /headers\[['"]CloudFront-Viewer-City['"]\]/i,
    task: {
      id: 'geo-city',
      type: 'GAP',
      category: 'INFRA',
      title: 'Geolocation Header Requirement',
      description: 'Logic references "CloudFront-Viewer-City". This header is only available if explicitly enabled in the Origin Request Policy.',
      docsUrl: AWS_LINKS.DOCS.GEOLOCATION
    }
  },
  {
    pattern: /headers\[['"](host|connection|via|content-length)['"]\]\s*=/i,
    task: {
      id: 'readonly-mutation',
      type: 'BLOCKER',
      category: 'CODE',
      title: 'Read-Only Header Mutation',
      description: 'Attempting to modify a restricted system header. This operation is prohibited in the CloudFront production environment (CFF).',
      docsUrl: AWS_LINKS.DOCS.CFF_READONLY_HEADERS
    }
  }
];

interface FidelityAuditModalProps {
  hooks: DistributionHook[];
  onClose: () => void;
}

export default function FidelityAuditModal({ hooks, onClose }: FidelityAuditModalProps) {
  const auditTasks = hooks.flatMap(hook => {
    const code = hook.code || '';
    return ROADMAP_RULES
      .filter(rule => rule.pattern.test(code))
      .map(rule => ({ ...rule.task, hookPath: hook.path }));
  });

  const uniqueTasks: (RoadmapTask & { hookPath: string })[] = [];
  const seenIds = new Set();
  auditTasks.forEach(t => {
    if (!seenIds.has(t.id)) {
      uniqueTasks.push(t);
      seenIds.add(t.id);
    }
  });

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--pro-modal-overlay)',
      backdropFilter: 'blur(var(--pro-modal-blur))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '2rem'
    }}>
      <div style={{
        background: 'var(--pro-modal-bg)',
        border: '1px solid var(--pro-modal-border)',
        borderRadius: 16, width: '100%', maxWidth: 740, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
        overflow: 'hidden'
      }}>

        <header style={{
          padding: '1.75rem 2rem',
          borderBottom: '1px solid var(--pro-modal-border)',
          background: 'var(--pro-modal-header)'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldAlert color="var(--pro-blocker-coral)" size={24} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--pro-text-main)', letterSpacing: '-0.02em' }}>CloudFront Fidelity Audit</h2>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--pro-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>High-Fidelity diagnostic for production deployment safety.</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--pro-text-dim)', cursor: 'pointer', transition: 'color 0.2s', padding: 4 }} onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = 'var(--pro-text-dim)'}><X size={24} /></button>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
          {uniqueTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--pro-text-dim)' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                <ShieldCheck size={40} color="var(--pro-success-emerald)" />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '1.25rem', color: 'var(--pro-text-main)', fontWeight: 800 }}>Audit Passed</h3>
              <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6, maxWidth: 400, marginInline: 'auto' }}>No fidelity gaps or production blockers detected in the current logic hooks.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 0' }}>
                <ClipboardList size={20} color="var(--pro-text-dim)" />
                <span style={{ fontSize: '0.95rem', color: 'var(--pro-text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>AWS Production Environment Requirements</span>
              </div>

              {uniqueTasks.sort((a, _b) => (a.type === 'BLOCKER' ? -1 : 1)).map((task, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.01)',
                  border: '1px solid var(--pro-modal-border)',
                  borderRadius: 14, padding: '1.5rem', display: 'flex', gap: 20,
                  transition: 'background 0.2s'
                }}>
                  <div style={{ marginTop: 4 }}>
                    {task.type === 'BLOCKER' ? <AlertTriangle size={24} color="var(--pro-blocker-coral)" /> :
                        <Info size={24} color="var(--pro-roadmap-blue)" />}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: task.type === 'BLOCKER' ? 'var(--pro-blocker-coral)' : 'var(--pro-text-main)' }}>{task.title}</h4>
                        <span style={{
                          fontSize: '0.55rem', padding: '2px 8px', borderRadius: 100,
                          background: task.type === 'BLOCKER' ? 'rgba(255, 107, 107, 0.1)' : 'rgba(255,255,255,0.05)',
                          color: task.type === 'BLOCKER' ? 'var(--pro-blocker-coral)' : 'var(--pro-text-dim)',
                          fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em'
                        }}>{task.type === 'BLOCKER' ? 'PRODUCTION BLOCKER' : 'FIDELITY GAP'}</span>
                      </div>
                      {task.category === 'CODE' ? (
                        <a
                          href={AWS_LINKS.CONSOLE.CFF}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Navigate to AWS CloudFront Functions (CFF) dashboard"
                          style={{
                            fontSize: '0.6rem', padding: '3px 10px', borderRadius: 6,
                            background: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.2)',
                            color: '#f97316', fontWeight: 800, textDecoration: 'none',
                            display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249, 115, 22, 0.2)'; e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(249, 115, 22, 0.1)'; e.currentTarget.style.color = '#f97316'; }}
                        >
                          AWS CONSOLE <ExternalLink size={10} />
                        </a>
                      ) : (
                        <a
                          href={AWS_LINKS.CONSOLE.DISTRIBUTIONS}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Navigate to AWS CloudFront Distributions dashboard"
                          style={{
                            fontSize: '0.6rem', padding: '3px 10px', borderRadius: 6,
                            background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)',
                            color: 'var(--pro-roadmap-blue)', fontWeight: 800, textDecoration: 'none',
                            display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'; e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'; e.currentTarget.style.color = 'var(--pro-roadmap-blue)'; }}
                        >
                          AWS CONSOLE <ExternalLink size={10} />
                        </a>
                      )}
                    </div>

                    <p style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', color: 'var(--pro-text-dim)', lineHeight: 1.6 }}>{task.description}</p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: 12 }}>
                      <span style={{ fontSize: '0.7rem', color: '#484f58', fontStyle: 'italic' }}>Detection in: {task.hookPath.split(/[\\\/]/).pop()}</span>
                      {task.docsUrl && (
                        <a href={task.docsUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: 'var(--pro-roadmap-blue)', textDecoration: 'none', fontWeight: 700 }}>
                          REF: AWS Documentation <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer style={{ padding: '1.5rem 2rem', borderTop: '1px solid var(--pro-modal-border)', background: 'var(--pro-modal-header)', display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.85rem 2.5rem',
              background: 'transparent',
              color: 'var(--pro-text-dim)', border: '1px solid var(--pro-modal-border)', borderRadius: 10,
              fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--pro-text-dim)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--pro-text-dim)'; e.currentTarget.style.borderColor = 'var(--pro-modal-border)'; }}
          >
            Closed Audit
          </button>
        </footer>
      </div>
    </div>
  );
}
