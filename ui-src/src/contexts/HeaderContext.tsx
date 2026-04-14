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
      .then(data => setHeaders(Array.isArray(data) ? data : []));
  }, []);

  const updateHeaders = (newHeaders: StickyHeader[]) => {
    setHeaders(newHeaders);
    setIsDirty(true);
  };

  const applyHeaders = async () => {
    await fetch('/api/sticky', {
      method: 'POST',
      body: JSON.stringify(headers)
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
