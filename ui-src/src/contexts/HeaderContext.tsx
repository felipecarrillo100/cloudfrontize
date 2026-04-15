import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { StickyHeader } from '../types';

interface HeaderContextType {
  headers: StickyHeader[];
  isDirty: boolean;
  updateHeaders: (headers: StickyHeader[]) => void;
  applyHeaders: () => Promise<void>;
  resetHeaders: () => Promise<void>;
}

const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [headers, setHeaders] = useState<StickyHeader[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    fetch('/api/sticky')
      .then(res => res.json())
      .then(data => {
        // Backend returns { request: {}, response: {} } — convert to StickyHeader[]
        const arr: StickyHeader[] = [];
        Object.entries(data.request || {}).forEach(([k, v]) => arr.push({ key: k, value: String(v), target: 'request', enabled: true }));
        Object.entries(data.response || {}).forEach(([k, v]) => arr.push({ key: k, value: String(v), target: 'response', enabled: true }));
        setHeaders(arr);
      });
  }, []);

  const updateHeaders = (newHeaders: StickyHeader[]) => {
    setHeaders(newHeaders);
    setIsDirty(true);
  };

  const applyHeaders = async () => {
    // Backend expects { requestHeaders: {}, responseHeaders: {} } — convert from StickyHeader[]
    const payload: any = { requestHeaders: {}, responseHeaders: {} };
    headers.forEach(h => {
      if (!h.enabled || !h.key) return;
      if (h.target === 'response') payload.responseHeaders[h.key] = h.value;
      else payload.requestHeaders[h.key] = h.value;
    });
    await fetch('/api/sticky', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setIsDirty(false);
  };

  const resetHeaders = async () => {
    const res = await fetch('/api/sticky');
    const data = await res.json();
    setHeaders(Array.isArray(data) ? data : []);
    setIsDirty(false);
  };

  return (
    <HeaderContext.Provider value={{
      headers, isDirty, updateHeaders, applyHeaders, resetHeaders
    }}>
      {children}
    </HeaderContext.Provider>
  );
}

export function useHeader() {
  const context = useContext(HeaderContext);
  if (!context) throw new Error('useHeader must be used within a HeaderProvider');
  return context;
}
