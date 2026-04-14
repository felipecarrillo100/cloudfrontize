import { useState, useMemo } from 'react';
import { Search, Activity } from 'lucide-react';
import { useDistribution } from '../contexts/DistributionContext';
import type { RequestEntry } from '../types';

export default function TrafficCenter() {
  const { requests, clearHistory } = useDistribution();
  const [filter, setFilter] = useState<'all' | 'errors' | 'redirects' | 'rewrites'>('all');
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedStageIdx, setSelectedStageIdx] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'timestamp' | 'status' | 'duration'>('timestamp');

  const filteredRequests = useMemo(() => {
    let list = [...requests];
    // ... filtering and sorting logic remains same
    if (filter === 'errors') list = list.filter(r => r.status && r.status >= 400);
    if (filter === 'redirects') list = list.filter(r => r.status && r.status >= 300 && r.status < 400);
    if (filter === 'rewrites') list = list.filter(r => r.rewrite);

    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(r =>
        r.url?.toLowerCase().includes(s) ||
        String(r.status).includes(s)
      );
    }

    if (sortBy === 'status') list.sort((a, b) => (b.status || 0) - (a.status || 0));
    else if (sortBy === 'duration') list.sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));
    else list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return list;
  }, [requests, filter, search, sortBy]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusColor = (status?: number, isError?: boolean) => {
    if (isError || (status && status >= 500)) return '#ef4444';
    if (status && status >= 400) return '#f97316';
    if (status && status >= 300) return '#3b82f6';
    return '#22c55e';
  };

  const copyAsCurl = (r: RequestEntry) => {
    const h = Object.entries(r.reqHeaders || {}).map(([k, v]) => `-H "${k}: ${v}"`).join(' ');
    const curl = `curl -X ${r.method} "${r.url}" ${h}`;
    navigator.clipboard.writeText(curl);
  };

  const HeaderBox = ({ title, headers, color, subTitle }: { title: string, headers: any, color: string, subTitle?: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: '0.6rem', color, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}</div>
        {subTitle && <span style={{ fontSize: '0.55rem', color: '#484f58', fontWeight: 600 }}>({subTitle})</span>}
      </div>
      <pre className="header-box" style={{
        margin: 0, padding: '10px', fontSize: '0.75rem', color: '#8b949e', whiteSpace: 'pre-wrap',
        wordBreak: 'break-all', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6,
        background: '#0d1117', borderRadius: 8, border: `1px solid ${color}33`, maxHeight: 400, overflowY: 'auto', marginBottom: '4px'
      }}>
        {JSON.stringify(headers || {}, null, 2)}
      </pre>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0e1117' }}>
      {/* 1. Discrete Modular Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem 1rem', borderTop: '1px solid #334155', borderBottom: '1px solid #334155', background: '#1e293b', flexShrink: 0 }}>
        <Activity size={14} color="#3b82f6" />
        <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Real-time Edge Traffic</span>
      </div>

      {/* 2. Forensic Workspace */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0.75rem 1rem' }}>
        
        {/* Search & Filter Toolbar (Pinned) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.75rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'errors', 'redirects', 'rewrites'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '0.35rem 0.75rem', borderRadius: 8, border: '1px solid', cursor: 'pointer',
                    fontSize: '0.7rem', fontWeight: 600, textTransform: 'capitalize',
                    borderColor: filter === f ? '#f97316' : '#30363d',
                    background: filter === f ? 'rgba(249,115,22,0.1)' : 'transparent',
                    color: filter === f ? '#f97316' : '#8b949e'
                  }}
                >
                  {f}
                </button>
            ))}
          </div>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#484f58' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search traffic..."
              style={{ width: '100%', padding: '0.4rem 1rem 0.4rem 2.2rem', background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, color: '#fff', fontSize: '0.75rem', outline: 'none' }}
            />
          </div>
          <button onClick={clearHistory} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '0.75rem' }}>Clear History</button>
        </div>

        {/* Column Headers (Pinned) */}
        <div style={{ padding: '0.5rem 0.75rem', background: '#0d1117', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.65rem', fontWeight: 700, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.05em', borderRadius: '8px 8px 0 0', flexShrink: 0 }}>
          <span onClick={() => setSortBy('status')} title="Sort by HTTP Status" style={{ width: 50, cursor: 'pointer', color: sortBy === 'status' ? '#f97316' : 'inherit' }}>Status {sortBy === 'status' ? '▼' : ''}</span>
          <span style={{ width: 55 }}>Method</span>
          <span style={{ flex: 1 }}>Path / Journey</span>
          <span onClick={() => setSortBy('duration')} title="Sort by execution duration" style={{ width: 80, textAlign: 'right', cursor: 'pointer', color: sortBy === 'duration' ? '#f97316' : 'inherit', paddingRight: 40 }}>Time {sortBy === 'duration' ? '▼' : ''}</span>
          <span style={{ width: 20 }} />
        </div>

        {/* Scrollable Request Stream */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '0.75rem 0' }}>
          {filteredRequests.map((r) => {
            const isExpanded = expandedIds.has(r.id);
            const hasDetails = !!r.reqHeaders;
            const originStage = (r.stages || []).find(s => (s as any).name === 'Origin Response');
            
            return (
              <div key={r.id} style={{ background: '#161b22', borderRadius: 8, border: `1px solid ${isExpanded ? '#f97316' : '#30363d'}` }}>
                <div
                  onClick={() => toggleExpand(r.id)}
                  style={{ display: 'flex', flexDirection: 'column', padding: '0.6rem 0.75rem', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      width: 50, fontSize: '0.7rem', fontWeight: 700, color: statusColor(r.status, r.isError)
                    }}>
                      {r.status || '...'}
                    </span>
                    <span style={{ width: 55, fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8' }}>{r.method}</span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontFamily: "'JetBrains Mono', monospace", color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.url}</div>
                    </div>

                    <span style={{ fontSize: '0.65rem', color: '#8b949e', width: 80, textAlign: 'right', fontWeight: 600 }}>{r.durationMs != null ? `${r.durationMs}ms` : ''}</span>

                    <button
                      onClick={(e) => { e.stopPropagation(); copyAsCurl(r); }}
                      style={{ background: '#0d1117', border: '1px solid #30363d', color: '#8b949e', borderRadius: 4, cursor: 'pointer', fontSize: '0.7rem', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}
                      title="Copy as cURL"
                    >
                      <span style={{ fontSize: '0.6rem' }}>📋</span> cURL
                    </button>

                    <span style={{ color: '#484f58', transform: isExpanded ? 'rotate(180deg)' : 'none', fontSize: '0.7rem', width: 14, marginLeft: 8 }}>▼</span>
                  </div>

                  {originStage && (
                    <div style={{ marginTop: 2, marginLeft: 62, display: 'flex', alignItems: 'center', gap: 8, opacity: 0.8 }}>
                      <span style={{ fontSize: '0.8rem', color: '#30363d', fontWeight: 900 }}>┗━</span>
                      <span style={{ fontSize: '0.6rem', color: '#8b949e', fontWeight: 700, textTransform: 'uppercase' }}>[Origin] Fetch</span>
                      <span style={{ fontSize: '0.65rem', color: '#3b82f6', fontFamily: "'JetBrains Mono', monospace" }}>({(originStage as any).origin || 's3'})</span>
                      <span style={{ fontSize: '0.7rem', color: '#f97316', fontWeight: 800 }}>⮕</span>
                      <span style={{ fontSize: '0.65rem', color: '#c9d1d9', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>{(originStage as any).resolvedUri || (originStage as any).uri || r.url}</span>
                      <span style={{ fontSize: '0.65rem', color: statusColor((originStage as any).status), fontWeight: 700 }}>({(originStage as any).status || 200})</span>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div style={{ padding: '1.25rem', borderTop: '1px solid #30363d', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {!hasDetails ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 140, gap: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: '1px dashed #334155' }}>
                        {(r.status || r.error) ? (
                          <>
                            <span style={{ fontSize: '1.5rem' }}>ℹ️</span>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.85rem' }}>Forensic Snapshot</div>
                              <div style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: 4, maxWidth: 300 }}>
                                Initial headers were purged from the history buffer.
                                The execution journey and outcomes are still traceable below.
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ width: 16, height: 16, border: '2px solid #30363d', borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tracing Execution Journey...</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                          {/* Row 1: Journey + Metadata */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 1.5fr', gap: '1.5rem', alignItems: 'flex-start' }}>
                            {/* Journey Tree */}
                            <div style={{ padding: '1.25rem', background: '#161b22', borderRadius: 12, border: '1px solid #30363d' }}>
                              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center' }}>
                                <div
                                  onClick={() => setSelectedStageIdx(null)}
                                  style={{
                                    background: '#0d1117', border: '1px solid #30363d', color: '#8b949e',
                                    padding: '4px 10px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 800,
                                    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                                  }}
                                >
                                  Execution Journey
                                </div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {(r.stages || []).map((stage, idx) => {
                                  const name = (stage as any).name || '';
                                  const isHook = name.toLowerCase().includes('hook') || name.toLowerCase().includes('cff') || name.toLowerCase().includes('l@e');
                                  const isActive = selectedStageIdx === idx;

                                  return (
                                    <div
                                      key={idx}
                                      onClick={(e) => { e.stopPropagation(); setSelectedStageIdx(isActive ? null : idx); }}
                                      style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderLeft: `2px solid ${isActive ? '#f97316' : '#30363d'}`,
                                        marginLeft: 12, paddingLeft: 16, cursor: 'pointer', background: isActive ? 'rgba(249,115,22,0.05)' : 'transparent',
                                        borderRadius: '0 4px 4px 0'
                                      }}
                                    >
                                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isHook ? '#f97316' : '#3b82f6', marginTop: 4, flexShrink: 0, boxShadow: isActive ? `0 0 8px ${isHook ? '#f97316' : '#3b82f6'}` : 'none' }} />
                                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: isActive ? 800 : 700, color: isActive ? '#f97316' : '#f8fafc' }}>{name}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                          {(stage as any).status && <span style={{ fontSize: '0.65rem', color: statusColor((stage as any).status), fontWeight: 700 }}>[{(stage as any).status}]</span>}
                                          {(stage as any).resolvedUri && <span style={{ fontSize: '0.65rem', color: '#f97316', fontWeight: 800 }}> ➜ {(stage as any).resolvedUri}</span>}
                                          {(stage as any).uri && (stage as any).uri !== r.url && !(stage as any).resolvedUri && <span style={{ fontSize: '0.65rem', color: '#d3dae4' }}> ➜ {typeof (stage as any).uri === 'object' ? JSON.stringify((stage as any).uri) : (stage as any).uri}</span>}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* State Inspector Metadata */}
                            <div style={{ background: '#161b22', borderRadius: 12, border: '1px solid #30363d', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.6rem', color: selectedStageIdx !== null ? '#f97316' : '#8b949e', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                  {selectedStageIdx !== null ? `[Snapshot] After: ${(r.stages![selectedStageIdx] as any).name}` : 'Pipeline Intelligence'}
                                </div>
                                {selectedStageIdx !== null && (
                                  <button onClick={() => setSelectedStageIdx(null)} style={{ background: '#30363d', border: 'none', color: '#fff', fontSize: '0.55rem', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>SHOW FINAL</button>
                                )}
                              </div>

                              {selectedStageIdx !== null ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
                                  <div style={{ padding: '12px 16px', background: '#3b82f615', border: '1px solid #3b82f640', borderRadius: 8 }}>
                                    <div style={{ fontSize: '0.55rem', color: '#3b82f6', fontWeight: 900, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>SECTION ANALYZED</div>
                                    <div style={{ fontSize: '0.85rem', color: '#f8fafc', fontWeight: 800 }}>{(r.stages![selectedStageIdx] as any).name}</div>
                                  </div>
                                  <div style={{ padding: '12px 16px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 8 }}>
                                    <div style={{ fontSize: '0.55rem', color: '#484f58', fontWeight: 900, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>STAGE URI SNAPSHOT</div>
                                    <div style={{ fontSize: '0.7rem', color: '#c9d1d9', fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>
                                      {(r.stages![selectedStageIdx] as any).resolvedUri || (r.stages![selectedStageIdx] as any).uri || r.url}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#484f58', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                  Select a stage to inspect state snapshots
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Headers (Full Width) */}
                          <div style={{ background: '#161b22', borderRadius: 12, border: '1px solid #30363d', padding: '1.25rem' }}>
                            {selectedStageIdx !== null ? (
                              <HeaderBox
                                title="Headers Post-Execution"
                                color="#f97316"
                                headers={(r.stages![selectedStageIdx] as any).headers}
                                subTitle="High Fidelity Snapshot"
                              />
                            ) : (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem' }}>
                                <HeaderBox title="Viewer Provided" color="#f97316" headers={r.reqHeaders} subTitle="Initial" />
                                <HeaderBox title="Origin Returned" color="#3b82f6" headers={r.originResHeaders} subTitle="Mid-Flight" />
                                <HeaderBox title="Final Response" color="#22c55e" headers={r.resHeaders} subTitle="Terminal" />
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
