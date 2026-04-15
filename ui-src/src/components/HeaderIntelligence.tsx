import { useState } from 'react';
import { useHeader } from '../contexts/HeaderContext';
import type { StickyHeader } from '../types';
import { GEO_PRESETS, DEVICE_PRESETS, ORIGIN_PRESETS } from '../constants/presets';

/**
 * Header mutation and sticky state controller for the forensic UI.
 * 
 * @namespace Frontend
 * This component allows users to define sticky headers (request/response) 
 * that persist across emulator restarts. It supports presets for 
 * GEO-location mapping, device detection, and origin identification.
 */
export default function HeaderIntelligence() {
  const { headers, isDirty, updateHeaders, applyHeaders, resetHeaders } = useHeader();
  const [tab, setTab] = useState<'request' | 'response'>('request');

  const applyPresetArray = (presetList: any[]) => {
    let next = [...headers];
    presetList.forEach(p => {
      const idx = next.findIndex(h => h.key.toLowerCase() === p.key.toLowerCase() && h.target === (p.target || 'request'));
      if (idx >= 0) {
        next[idx] = { ...next[idx], value: p.value, enabled: true };
      } else {
        next.push({ key: p.key, value: p.value, target: (p.target || 'request'), enabled: true });
      }
    });
    updateHeaders(next);
  };

  const addHeader = (key = '', value = '', target = tab) => {
    const next = [...headers];
    next.push({ key, value, target: target as 'request' | 'response', enabled: true });
    updateHeaders(next);
  };

  const updateHeader = (index: number, field: 'key' | 'value', val: string) => {
    const next = [...headers];
    const filtered = next.filter(h => h.target === tab);
    const actualIndex = next.indexOf(filtered[index]);
    if (actualIndex >= 0) {
      next[actualIndex] = { ...next[actualIndex], [field]: val };
      updateHeaders(next);
    }
  };

  const removeHeader = (index: number) => {
    const next = [...headers];
    const filtered = next.filter(h => h.target === tab);
    const actualIndex = next.indexOf(filtered[index]);
    if (actualIndex >= 0) {
      next.splice(actualIndex, 1);
      updateHeaders(next);
    }
  };

  const importHeaders = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        const next: StickyHeader[] = [];

        // Support only the pure object format as requested
        if (json.requestHeaders) {
          Object.entries(json.requestHeaders).forEach(([k, v]) => {
            next.push({ key: k, value: String(v), target: 'request', enabled: true });
          });
        }
        if (json.responseHeaders) {
          Object.entries(json.responseHeaders).forEach(([k, v]) => {
            next.push({ key: k, value: String(v), target: 'response', enabled: true });
          });
        }
        
        if (next.length === 0 && !json.requestHeaders && !json.responseHeaders) {
           throw new Error('Invalid Format');
        }

        updateHeaders(next);
      } catch (err) {
        alert('Standardization Error: Header file must use the { "requestHeaders": {}, "responseHeaders": {} } format.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset for next import
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#161b22', borderRight: '1px solid #30363d' }}>
      <header style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Intelligence</span>
            {isDirty && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', boxShadow: '0 0 8px #f97316' }} />}
         </div>
         <div style={{ display: 'flex', gap: 6 }}>
            <label style={{ cursor: 'pointer', padding: '4px 8px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, fontSize: '0.55rem', fontWeight: 700, color: '#8b949e' }}>
              IMPORT
              <input type="file" accept=".json" onChange={importHeaders} style={{ display: 'none' }} />
            </label>
            <button
              onClick={() => {
                const exportObj: any = { requestHeaders: {}, responseHeaders: {} };
                headers.forEach(h => {
                  if (!h.enabled) return;
                  if (h.target === 'request') exportObj.requestHeaders[h.key] = h.value;
                  else exportObj.responseHeaders[h.key] = h.value;
                });
                const data = JSON.stringify(exportObj, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `cloudfrontize-headers-${new Date().toISOString().slice(0, 10)}.json`;
                link.click();
                URL.revokeObjectURL(url);
              }}
              disabled={headers.length === 0}
              style={{ cursor: headers.length === 0 ? 'not-allowed' : 'pointer', padding: '4px 8px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 4, fontSize: '0.55rem', fontWeight: 700, color: '#8b949e', opacity: headers.length === 0 ? 0.4 : 1 }}
            >
              EXPORT
            </button>
         </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Tab Selection */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#0d1117', borderRadius: 8, padding: 3 }}>
          {(['request', 'response'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              title={t === 'request' ? 'Simulate Viewer Request state' : 'Simulate Origin Response state'}
              style={{
                padding: '0.5rem', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                background: tab === t ? '#f97316' : 'transparent',
                color: tab === t ? '#fff' : '#484f58',
                transition: 'all 0.2s'
              }}
            >
              {t === 'request' ? 'Viewer' : 'Origin'}
            </button>
          ))}
        </div>

        {/* Preset Clusters */}
        {tab === 'request' ? (
          <>
            <div>
              <div style={{ fontSize: '0.65rem', color: '#484f58', fontWeight: 800, marginBottom: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Geo Presets</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {Object.keys(GEO_PRESETS).map(geo => (
                  <button
                    key={geo}
                    onClick={() => applyPresetArray(GEO_PRESETS[geo])}
                    title={`Simulate traffic coming from ${geo}`}
                    style={{ padding: '6px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, color: '#8b949e', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#484f58'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
                  >
                    {geo}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: '#484f58', fontWeight: 800, marginBottom: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Device Presets</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {Object.keys(DEVICE_PRESETS).map(dev => (
                  <button
                    key={dev}
                    onClick={() => applyPresetArray(DEVICE_PRESETS[dev])}
                    title={`Simulate a ${dev} device behavior`}
                    style={{ padding: '6px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, color: '#8b949e', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#484f58'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
                  >
                    {dev}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div>
            <div style={{ fontSize: '0.65rem', color: '#484f58', fontWeight: 800, marginBottom: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Origin Presets</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.keys(ORIGIN_PRESETS).map(label => (
                <button
                  key={label}
                  onClick={() => applyPresetArray(ORIGIN_PRESETS[label])}
                  title={`Apply ${label} response header pattern`}
                  style={{ padding: '6px 12px', background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, color: '#8b949e', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#484f58'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dynamic Header List (NO TRUNCATION - STACKED LAYOUT) */}
        <div style={{ borderTop: '1px solid #30363d', paddingTop: '1.5rem' }}>
          <div style={{ fontSize: '0.6rem', color: '#484f58', fontWeight: 800, marginBottom: 12, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
            <span>Active Headers</span>
            <span>{(headers || []).filter(h => h.target === tab).length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(headers || []).filter(h => h.target === tab).map((h, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', background: '#0d1117', borderRadius: 8, border: '1px solid #30363d', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: '#161b22', borderBottom: '1px solid #30363d', paddingRight: 4 }}>
                  <input
                    value={h.key}
                    onChange={e => updateHeader(i, 'key', e.target.value)}
                    placeholder="x-header-name"
                    title="Header name (Key)"
                    style={{ flex: 1, background: 'transparent', border: 'none', color: '#f97316', fontSize: '0.75rem', fontWeight: 700, padding: '8px 12px', outline: 'none', fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <button 
                    onClick={() => removeHeader(i)} 
                    title="Remove this header"
                    style={{ background: 'none', border: 'none', color: '#484f58', cursor: 'pointer', padding: '0 8px', fontSize: '1rem' }}
                  >×</button>
                </div>
                <input
                  value={h.value}
                  onChange={e => updateHeader(i, 'value', e.target.value)}
                  placeholder="value"
                  title="Header value"
                  style={{ background: 'transparent', border: 'none', color: '#8b949e', fontSize: '0.75rem', padding: '10px 12px', outline: 'none', fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
            ))}
            
            <button 
              onClick={() => addHeader()}
              title="Add a new custom header to the simulation"
              style={{ 
                marginTop: 4, padding: '12px', background: 'transparent', border: '1px dashed #30363d', color: '#484f58', borderRadius: 8, 
                fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#484f58'; e.currentTarget.style.color = '#8b949e'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#484f58'; }}
            >
              <span>+</span> Add Simulation Header
            </button>
          </div>
        </div>
      </div>

      {/* Persistence Actions */}
      <footer style={{ padding: '1rem', borderTop: '1px solid #30363d', background: '#161b22', display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
        <button
          onClick={applyHeaders}
          title="Apply all header simulations to the local CloudFront engine"
          style={{
            padding: '0.8rem', background: isDirty ? '#f97316' : '#30363d', color: '#fff', border: 'none', borderRadius: 8,
            fontSize: '0.75rem', fontWeight: 800, cursor: isDirty ? 'pointer' : 'default',
            animation: isDirty ? 'pulse 2s infinite' : 'none'
          }}
        >
          {isDirty ? 'Apply Changes' : 'Simulation Active'}
        </button>
        <button
          onClick={resetHeaders}
          title="Clear all simulations and revert to default headers"
          style={{ padding: '0.8rem 1.25rem', background: '#0d1117', color: '#484f58', border: '1px solid #30363d', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
        >
          Reset
        </button>
      </footer>

      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
          100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
        }
      `}</style>
    </div>
  );
}
