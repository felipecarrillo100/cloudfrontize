import { useEffect, useState, useMemo } from 'react';
import type { RequestEntry, StickyHeader, DistributionHook } from './types';
import Sidebar from './components/Sidebar';
import AboutModal from './components/AboutModal';
import FidelityCloud from './components/FidelityCloud';
import EdgeIntelligence from './components/EdgeIntelligence';
import FidelityAuditModal from './components/FidelityAuditModal';
import CodeViewer from './components/CodeViewer';
import ContextMenu from './components/ContextMenu';
import type { MenuNode } from './components/ContextMenu';
import ToolbarDropdown from './components/ToolbarDropdown';
import {
  Eye, Files, ExternalLink, Power, Target, Zap,
  CheckCircle, ShieldCheck, Layers, Activity
} from 'lucide-react';
import ErrorBanner from './components/ErrorBanner';

export default function App() {
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'errors' | 'redirects' | 'rewrites'>('all');
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, items: MenuNode[], title?: string } | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [headers, setHeaders] = useState<StickyHeader[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [sortBy, setSortBy] = useState<'timestamp' | 'status' | 'duration'>('timestamp');
  const [rps, setRps] = useState(0);
  const [activeHook, setActiveHook] = useState<DistributionHook | null>(null);
  const [dist, setDist] = useState<any>(null);
  const [selectedStageIdx, setSelectedStageIdx] = useState<number | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [systemError, setSystemError] = useState<any>(null);

  useEffect(() => {
    fetch('/api/distribution')
      .then(res => res.json())
      .then(setDist);
  }, []);

  // SSE
  useEffect(() => {
    const es = new EventSource('/events');
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      console.log("[SSE EVENT]", data);
      if (data.type === 'init') {
        rebuildHistory(data.history || []);
      } else if (data.id === 'SYSTEM_BUILD') {
        if (data.type === 'error') setSystemError(data.details);
        else if (data.type === 'stage' && data.details?.name === 'Build Success') setSystemError(null);
      } else {
        setRequests(prev => mergeSseEvent(prev, data));
        updateRps();
      }
    };
    return () => es.close();
  }, []);

  const updateRps = () => {
    setRps(prev => prev + 1);
    setTimeout(() => setRps(p => Math.max(0, p - 1)), 1000);
  };

  useEffect(() => {
    expandedIds.forEach(id => {
      const entry = requests.find(r => r.id === id);
      if (entry && !entry.reqHeaders) {
        fetch(`/api/detail/${id}`)
          .then(res => res.json())
          .then(data => {
            setRequests(prev => prev.map(r => {
              if (r.id !== id) return r;
              let updated: RequestEntry = { id: r.id, timestamp: r.timestamp };
              if (Array.isArray(data)) {
                data.forEach(ev => { updated = applyEvent(updated, ev); });
              } else {
                updated = applyEvent(updated, data);
              }
              return updated;
            }));
          });
      }
    });
  }, [expandedIds]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [activeHookId, setActiveHookId] = useState<string | null>(null);

  const handleContextAction = async (action: string) => {
    // 1. Global Actions (No activeHookId needed)
    if (action === 'enable-all') {
      await fetch('/api/hooks/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true })
      });
      fetch('/api/distribution').then(res => res.json()).then(setDist);
      return;
    } else if (action === 'disable-all') {
      await fetch('/api/hooks/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disableAll: true })
      });
      fetch('/api/distribution').then(res => res.json()).then(setDist);
      return;
    } else if (action === 'show-audit') {
      setShowAudit(true);
      return;
    }

    // 2. Hook-Specific Actions
    const hook = dist?.hooks.find((h: any) => h.id === activeHookId);
    if (!hook) return;

    if (action === 'view') {
      setActiveHook(hook);
    } else if (action === 'copy-path') {
      navigator.clipboard.writeText(hook.path);
    } else if (action === 'copy-prod') {
      fetch(`/api/production-code?id=${hook.id}&level=baked`)
        .then(res => res.text())
        .then(code => navigator.clipboard.writeText(code));
    } else if (action === 'copy-min') {
      fetch(`/api/production-code?id=${hook.id}&level=minified`)
        .then(res => res.text())
        .then(code => navigator.clipboard.writeText(code));
    } else if (action === 'copy-uglify') {
      fetch(`/api/production-code?id=${hook.id}&level=uglified`)
        .then(res => res.text())
        .then(code => navigator.clipboard.writeText(code));
    } else if (action === 'edit') {
      fetch(`/api/open-editor?path=${encodeURIComponent(hook.path)}`);
    } else if (action === 'toggle') {
      await fetch('/api/hooks/control', {
        method: 'POST',
        body: JSON.stringify({ id: hook.id, disabled: !(hook as any).disabled })
      });
      fetch('/api/distribution').then(res => res.json()).then(setDist);
    } else if (action === 'isolate') {
      await fetch('/api/hooks/control', {
        method: 'POST',
        body: JSON.stringify({ id: hook.id, isolate: true })
      });
      fetch('/api/distribution').then(res => res.json()).then(setDist);
    }
  };

  const getHookMenuSchema = (hook: DistributionHook): MenuNode[] => [
    { id: 'view', label: 'View Source', icon: <Eye size={14} />, color: '#3b82f6', tooltip: 'View raw source code and metadata' },
    { id: 'copy-path', label: 'Copy Path', icon: <Files size={14} />, color: '#3b82f6', tooltip: 'Copy absolute filesystem path to clipboard' },
    { id: 'edit', label: 'Open in Editor', icon: <ExternalLink size={14} />, color: '#3b82f6', tooltip: 'Open this file in your default code editor' },
    { id: 'sep1', label: '', isSeparator: true },
    {
      id: 'prod-parent',
      label: 'Copy for Production',
      icon: <Zap size={14} />,
      color: '#f59e0b',
      tooltip: 'Export production-ready code for AWS deployment',
      children: [
        { id: 'copy-prod', label: '1. Production Ready', icon: <CheckCircle size={14} />, color: '#22c55e', tooltip: 'Bakes all __VAR__ variables and strips CloudFrontize metadata' },
        { id: 'copy-min', label: '2. Minimized', icon: <Zap size={14} />, color: '#f59e0b', tooltip: 'Strips comments and whitespace (readable variables)' },
        { id: 'copy-uglify', label: '3. Optimized', icon: <ShieldCheck size={14} />, color: '#8b5cf6', tooltip: 'Full uglification/mangling for maximum payload reduction' }
      ]
    },
    { id: 'sep2', label: '', isSeparator: true },
    {
      id: 'toggle',
      label: hook.disabled ? 'Enable Hook' : 'Disable Hook',
      icon: <Power size={14} />,
      color: hook.disabled ? '#22c55e' : '#f97316',
      tooltip: 'Toggle this specific hook on or off'
    },
    { id: 'enable-all', label: 'Enable All Stages', icon: <CheckCircle size={14} />, color: '#22c55e', tooltip: 'Re-enable all hooks in the entire functional pipeline' },
    { id: 'isolate', label: 'Enable Only This', icon: <Target size={14} />, color: '#a855f7', tooltip: 'Disable all other hooks to isolate this specific node' }
  ];

  function rebuildHistory(history: any[]) {
    const map: Record<string, RequestEntry> = {};
    let latestBuildErr = null;

    history.forEach(ev => {
      if (ev.id === 'SYSTEM_BUILD') {
        if (ev.type === 'error') latestBuildErr = ev.details;
        else if (ev.type === 'stage' && ev.details?.name === 'Build Success') latestBuildErr = null;
        return;
      }
      if (!map[ev.id]) map[ev.id] = { id: ev.id, timestamp: ev.timestamp };
      applyEvent(map[ev.id], ev);
    });
    setRequests(Object.values(map));
    if (latestBuildErr) setSystemError(latestBuildErr);
  }

  function applyEvent(entry: RequestEntry, ev: any) {
    const { type, details, durationMs, timestamp } = ev;
    if (type === 'stage') {
      if (!entry.stages) entry.stages = [];
      if (details.headers) {
        // Fidelity Fix: Ensure EVERY stage carries its own headers for snapshots
      }
      entry.stages.push(details);
      if (details.name === 'Origin Response' && details.headers) {
        entry.originResHeaders = details.headers;
      }
    } else if (type === 'request') {
      entry.method = details?.method;
      entry.url = details?.url;
      entry.reqHeaders = details?.headers;
      entry.timestamp = timestamp;
      entry.steps = [{ uri: details?.url }];
      if (!entry.stages) entry.stages = [{ name: 'Client Request', uri: details?.url }];
    } else if (type === 'response') {
      entry.status = details?.status;
      entry.durationMs = durationMs;
      entry.resHeaders = details?.headers;
    } else if (type === 'error') {
      entry.isError = true;
      entry.error = details;
      entry.status = 502;
    } else if (type === 'rewrite') {
      entry.rewrite = details;
      if (entry.steps && entry.steps.length === 1) {
        entry.steps.push({ uri: details.to });
      }
    }
    return entry;
  }

  function mergeSseEvent(prev: RequestEntry[], ev: any): RequestEntry[] {
    const idx = prev.findIndex(r => r.id === ev.id);
    if (idx >= 0) {
      const updated = [...prev];
      updated[idx] = applyEvent({ ...updated[idx] }, ev);
      return updated;
    }
    if (ev.type === 'request' || ev.type === 'stage') {
      const newEntry: RequestEntry = { id: ev.id, timestamp: ev.timestamp || new Date().toISOString() };
      applyEvent(newEntry, ev);
      return [newEntry, ...prev].slice(0, 500);
    }
    return prev;
  }

  const filteredRequests = useMemo(() => {
    let list = [...requests];
    if (filter === 'errors') list = list.filter(r => r.status && r.status >= 400);
    if (filter === 'redirects') list = list.filter(r => r.status && r.status >= 300 && r.status < 400);
    if (filter === 'rewrites') list = list.filter(r => r.rewrite);

    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(r =>
        r.url?.toLowerCase().includes(s) ||
        r.id.toLowerCase().includes(s) ||
        String(r.status).includes(s)
      );
    }

    if (sortBy === 'status') list.sort((a, b) => (b.status || 0) - (a.status || 0));
    else if (sortBy === 'duration') list.sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));
    else list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return list;
  }, [requests, filter, search, sortBy]);

  const applyHeaders = async (nextHeaders: StickyHeader[]) => {
    const sticky: Record<string, string> = {};
    nextHeaders.filter(h => h.enabled && h.target === 'request').forEach(h => { sticky[h.key] = h.value; });
    await fetch('/api/sticky', { method: 'POST', body: JSON.stringify(sticky) });
    setHeaders(nextHeaders);
    setIsDirty(false);
  };

  const resetHeaders = () => {
    setHeaders([]);
    fetch('/api/sticky', { method: 'POST', body: JSON.stringify({}) });
    setIsDirty(false);
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
        background: '#0d1117', borderRadius: 8, border: `1px solid ${color}33`, maxHeight: 400, overflowY: 'auto'
      }}>
        {JSON.stringify(headers || {}, null, 2)}
      </pre>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', background: '#0e1117', color: '#f8fafc', fontFamily: "'Inter', -apple-system, sans-serif", overflow: 'hidden' }}>

      <Sidebar
        headers={headers}
        isDirty={isDirty}
        onApply={applyHeaders}
        onReset={resetHeaders}
        onUpdate={(h) => { setHeaders(h); setIsDirty(true); }}
        onShowAbout={() => setShowAbout(true)}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 64, background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', padding: '0 1.5rem', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f97316' }}>CLOUDFRONTIZE <span style={{ color: '#fff' }}>PRO</span></span>
            <div title="Requests Per Second (Real-time Live Traffic)" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(34,197,94,0.2)', cursor: 'default' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#22c55e' }}>{rps} RPS</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginRight: 'auto', marginLeft: '1rem' }}>
            {(['all', 'errors', 'redirects', 'rewrites'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                title={`Filter traffic by ${f}`}
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

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            title="Search requests by URL, Status, or Request ID"
            placeholder="Search traffic..."
            style={{ padding: '0.4rem 1rem', background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, color: '#fff', fontSize: '0.75rem', outline: 'none', width: 240 }}
          />

          <button onClick={() => setRequests([])} title="Clear all local traffic history" style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '0.75rem' }}>Clear History</button>
        </header>

        {systemError && <ErrorBanner error={systemError} onDismiss={() => setSystemError(null)} />}

        {/* Panel Header: Highway */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem 1rem', borderTop: '1px solid #334155', borderBottom: '1px solid #334155', background: '#1e293b', position: 'relative' }}>
          <Layers size={14} color="#f97316" />
          <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Functional Fidelity Cloud</span>

          <div style={{ flex: 1 }} />

          <div>
            <ToolbarDropdown
              label="Cloud Actions"
              align="right"
              items={[
                {
                  id: dist?.hooks.some((h: any) => !h.disabled) ? 'disable-all' : 'enable-all',
                  label: dist?.hooks.some((h: any) => !h.disabled) ? 'Disable All' : 'Enable All',
                  icon: <Power size={14} color={dist?.hooks.some((h: any) => !h.disabled) ? '#ef4444' : '#22c55e'} />
                },
                {
                  id: 'show-audit',
                  label: 'AWS Audit',
                  icon: <ShieldCheck size={14} color="#22c55e" />
                }
              ]}
              onAction={handleContextAction}
            />
          </div>
        </div>

        <div style={{ flex: 0, padding: '0.5rem 0' }}>
          <FidelityCloud
            dist={dist}
            onContextMenu={(e, hook) => {
              const items = getHookMenuSchema(hook);
              setActiveHookId(hook.id || null);
              setContextMenu({ x: e.clientX, y: e.clientY, items, title: 'Node Actions' });
            }}
          />
        </div>

        {/* Panel Header: Traffic */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.75rem 1rem', borderTop: '1px solid #334155', borderBottom: '1px solid #334155', background: '#1e293b' }}>
          <Activity size={14} color="#3b82f6" />
          <span style={{ fontSize: '0.65rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Real-time Edge Traffic</span>
        </div>
        {/* Sorting Headers */}
        <div style={{ padding: '0.5rem 1.75rem', background: '#0d1117', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.65rem', fontWeight: 700, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <span onClick={() => setSortBy('status')} title="Sort by HTTP Status" style={{ width: 50, cursor: 'pointer', color: sortBy === 'status' ? '#f97316' : 'inherit' }}>Status {sortBy === 'status' ? '▼' : ''}</span>
          <span style={{ width: 55 }}>Method</span>
          <span style={{ flex: 1 }}>Path / Journey</span>
          <span onClick={() => setSortBy('duration')} title="Sort by execution duration" style={{ width: 80, textAlign: 'right', cursor: 'pointer', color: sortBy === 'duration' ? '#f97316' : 'inherit', paddingRight: 40 }}>Time {sortBy === 'duration' ? '▼' : ''}</span>
          <span style={{ width: 20 }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredRequests.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#484f58' }}>
              <span style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>☁️</span>
              <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Awaiting Edge Traffic...</p>
            </div>
          ) : (
            filteredRequests.map(r => {
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
                        width: 50, textAlign: 'center', fontSize: '0.75rem', fontWeight: 800, padding: '4px 0', borderRadius: 6,
                        background: `${statusColor(r.status, r.isError)}33`, color: statusColor(r.status, r.isError), border: `1px solid ${statusColor(r.status, r.isError)}66`
                      }}>{r.status || '...'}</span>

                      <span style={{
                        width: 55, textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, padding: '2px 0', borderRadius: 4,
                        background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)', textTransform: 'uppercase'
                      }}>{r.method || 'GET'}</span>

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

                      <span style={{ color: '#484f58', transform: isExpanded ? 'rotate(180deg)' : 'none', fontSize: '0.7rem', width: 14, marginLeft: 8 }}>▾</span>
                    </div>

                    {/* Summary Sub-Row (CLI Parity) */}
                    {originStage && (
                      <div style={{ marginTop: 2, marginLeft: 62, display: 'flex', alignItems: 'center', gap: 8, opacity: 0.8 }}>
                        <span style={{ fontSize: '0.8rem', color: '#30363d', fontWeight: 900 }}>╰─</span>
                        <span style={{ fontSize: '0.6rem', color: '#8b949e', fontWeight: 700, textTransform: 'uppercase' }}>[Origin] Fetch</span>
                        <span style={{ fontSize: '0.65rem', color: '#3b82f6', fontFamily: "'JetBrains Mono', monospace" }}>({(originStage as any).origin || 's3'})</span>
                        <span style={{ fontSize: '0.7rem', color: '#f97316', fontWeight: 800 }}>⟹</span>
                        <span style={{ fontSize: '0.65rem', color: '#c9d1d9', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>{(originStage as any).resolvedUri || (originStage as any).uri}</span>
                        <span style={{ fontSize: '0.65rem', color: statusColor((originStage as any).status), fontWeight: 700 }}>({(originStage as any).status || 200})</span>
                        <span style={{ fontSize: '0.6rem', color: '#484f58' }}>[{(originStage as any).durationMs}ms]</span>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '1.25rem', borderTop: '1px solid #30363d', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      {!hasDetails ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100, gap: 12 }}>
                          <div style={{ width: 16, height: 16, border: '2px solid #30363d', borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#8b949e' }}>Loading Trace...</span>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Row 1: Journey + Metadata */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 1.5fr', gap: '1.5rem', alignItems: 'flex-start' }}>
                              {/* Journey Tree */}
                              <div style={{ padding: '1rem', background: '#161b22', borderRadius: 12, border: '1px solid #30363d' }}>
                                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center' }}>
                                  <div 
                                    onClick={() => setSelectedStageIdx(null)} 
                                    style={{ 
                                      background: '#0d1117', border: '1px solid #30363d', color: '#8b949e',
                                      padding: '4px 10px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 800,
                                      cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#f9731666'; e.currentTarget.style.color = '#f97316'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
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
                                          transition: 'all 0.2s', borderRadius: '0 4px 4px 0'
                                        }}
                                      >
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: isHook ? '#f97316' : '#3b82f6', marginTop: 4, flexShrink: 0, boxShadow: isActive ? `0 0 8px ${isHook ? '#f97316' : '#3b82f6'}` : 'none' }} />
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                          <div style={{ fontSize: '0.75rem', fontWeight: isActive ? 800 : 600, color: isActive ? '#f97316' : '#f8fafc' }}>{name}</div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            {(stage as any).status && <span style={{ fontSize: '0.65rem', color: statusColor((stage as any).status), fontWeight: 700 }}>[{(stage as any).status}]</span>}
                                            {(stage as any).resolvedUri && <span style={{ fontSize: '0.65rem', color: '#f97316', fontWeight: 800 }}> ⟹ {(stage as any).resolvedUri}</span>}
                                            {(stage as any).uri && (stage as any).uri !== r.url && !(stage as any).resolvedUri && <span style={{ fontSize: '0.65rem', color: '#d3dae4' }}> ⟹ {typeof (stage as any).uri === 'object' ? JSON.stringify((stage as any).uri) : (stage as any).uri}</span>}
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
                                  <div style={{ fontSize: '0.6rem', color: selectedStageIdx !== null ? '#f97316' : '#8b949e', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
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
            })
          )}
        </div>
      </main>

      <EdgeIntelligence requests={requests} />

      {showAudit && <FidelityAuditModal hooks={dist?.hooks || []} onClose={() => setShowAudit(false)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {activeHook && <CodeViewer hook={activeHook} onClose={() => setActiveHook(null)} />}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          title={contextMenu.title}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
        />
      )}

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
    </div>
  );
}
