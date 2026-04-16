import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { DistributionInfo, RequestEntry } from '../types';

interface DistributionContextType {
  dist: DistributionInfo | null;
  requests: RequestEntry[];
  lastEventId: number; 
  loading: boolean;
  refreshDistribution: () => Promise<void>;
  toggleHook: (id: string, disabled: boolean) => Promise<void>;
  isolateHook: (id: string) => Promise<void>;
  disableAllHooks: (disableAll: boolean) => Promise<void>;
  resetHooks: () => Promise<void>;
  clearHistory: () => void;
  buildErrors: Record<string, any>;
}

/**
 * The primary data provider for the CloudFrontize Forensic Dashboard.
 * 
 * @namespace Frontend
 * This context manages the live synchronization between the Frontend and the 
 * Backend Telemetry system. It handles:
 * - Real-time request history (Atomic Journeys) via Server-Sent Events (SSE).
 * - Distribution metadata (Origins, Behaviors).
 * - Hook isolation and toggle controls (syncing back to the Orchestrator).
 * 
 * @see {@link Backend.Orchestrator} | For the backend orchestration logic.
 * @see {@link Backend.Telemetry} | For the data broadcast source.
 */
const DistributionContext = createContext<DistributionContextType | undefined>(undefined);

export function DistributionProvider({ children }: { children: ReactNode }) {
  const [dist, setDist] = useState<DistributionInfo | null>(null);
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [lastEventId, setLastEventId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buildErrors, setBuildErrors] = useState<Record<string, any>>({});
  const esRef = useRef<EventSource | null>(null);

  const applyEvent = (entry: RequestEntry, ev: any) => {
    const { type, details, durationMs, timestamp } = ev;
    if (type === 'stage') {
      if (!entry.stages) entry.stages = [];
      entry.stages.push(details);
      if (details.name === 'Origin Response' && details.headers) {
        entry.originResHeaders = details.headers;
      }
    } else if (type === 'request') {
      entry.method = details?.method;
      entry.url = details?.url;
      entry.reqHeaders = details?.headers;
      entry.timestamp = timestamp;
      // Body forensics: map request body fields from the initial broadcast
      if (details?.body) {
        entry.reqBody = details.body;
        entry.reqBodySize = details.bodySize;
        entry.reqBodyTruncated = details.bodyTruncated;
        entry.reqContentType = details.contentType;
      }
      if (!entry.stages) entry.stages = [{ name: 'Client Request', uri: details?.url, headers: details?.headers, body: details?.body, bodySize: details?.bodySize, bodyTruncated: details?.bodyTruncated, contentType: details?.contentType }];
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
    }
    return entry;
  };


  const mergeSseEvent = (prev: RequestEntry[], ev: any): RequestEntry[] => {
    const idx = prev.findIndex(r => r.id === ev.id);
    if (idx >= 0) {
      const updated = [...prev];
      updated[idx] = applyEvent({ ...updated[idx] }, ev);
      return updated;
    }
    const newEntry: RequestEntry = { id: ev.id, timestamp: ev.timestamp || new Date().toISOString() };
    applyEvent(newEntry, ev);
    return [newEntry, ...prev].slice(0, 5000);
  };

  const rebuildHistory = (history: any[]) => {
    const map: Record<string, RequestEntry> = {};
    history.forEach(ev => {
      if (!map[ev.id]) map[ev.id] = { id: ev.id, timestamp: ev.timestamp };
      applyEvent(map[ev.id], ev);
    });
    setRequests(Object.values(map).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  };

  const refreshDistribution = async () => {
    try {
      const res = await fetch('/api/distribution');
      const data = await res.json();
      setDist(data);

      // Hydration: Extract build errors from metadata during initial load
      if (data.hooks) {
        const errors: Record<string, any> = {};
        for (const h of data.hooks) {
          if (h.error) errors[h.path] = h.error;
        }
        setBuildErrors(prev => ({ ...prev, ...errors }));
      }
    } catch (err) {
      console.error('Failed to fetch distribution:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshDistribution();

    const es = new EventSource('/events');
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        
        if (data.type === 'init') {
          rebuildHistory(data.history || []);
          if (data.buildErrors) setBuildErrors(data.buildErrors);
        } else if (data.type === 'distribution') {
          setDist(data.data);
        } else if (data.id === 'SYSTEM_BUILD') {
           if (data.type === 'error') {
               setBuildErrors(prev => ({ ...prev, [data.details.path]: data.details }));
           } else if (data.type === 'success') {
               setBuildErrors(prev => {
                   const next = { ...prev };
                   delete next[data.details.file];
                   return next;
               });
               // Refresh distribution to get clean code/metadata
               refreshDistribution();
           }
        } else {
          // It's a traffic event (request, response, stage, etc.)
          setRequests(prev => mergeSseEvent(prev, data));
          if (data.type === 'request') {
             setLastEventId(prev => prev + 1);
          }
        }
      } catch (err) {
        console.error('SSE Parse Error:', err);
      }
    };

    return () => {
      if (esRef.current) esRef.current.close();
    };
  }, []);

  const toggleHook = async (id: string, disabled: boolean) => {
    await fetch('/api/hooks/control', {
      method: 'POST',
      body: JSON.stringify({ id, disabled })
    });
    await refreshDistribution();
  };

  const isolateHook = async (id: string) => {
    await fetch('/api/hooks/control', {
      method: 'POST',
      body: JSON.stringify({ id, isolate: true })
    });
    await refreshDistribution();
  };
  
  const disableAllHooks = async (disableAll: boolean) => {
    await fetch('/api/hooks/control', {
      method: 'POST',
      body: JSON.stringify({ disableAll })
    });
    await refreshDistribution();
  };

  const resetHooks = async () => {
    await fetch('/api/hooks/control', {
      method: 'POST',
      body: JSON.stringify({ reset: true })
    });
    await refreshDistribution();
  };

  const clearHistory = () => {
    setRequests([]);
  };

  return (
    <DistributionContext.Provider value={{
      dist, requests, lastEventId, loading, refreshDistribution, toggleHook, isolateHook, disableAllHooks, resetHooks, clearHistory, buildErrors
    }}>
      {children}
    </DistributionContext.Provider>
  );
}

export function useDistribution() {
  const context = useContext(DistributionContext);
  if (!context) throw new Error('useDistribution must be used within a DistributionProvider');
  return context;
}
