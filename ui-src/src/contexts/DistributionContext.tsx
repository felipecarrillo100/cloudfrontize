import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { DistributionInfo } from '../types';

interface DistributionContextType {
  dist: DistributionInfo | null;
  loading: boolean;
  refreshDistribution: () => Promise<void>;
  toggleHook: (id: string, disabled: boolean) => Promise<void>;
  isolateHook: (id: string) => Promise<void>;
  disableAllHooks: (disableAll: boolean) => Promise<void>;
  resetHooks: () => Promise<void>;
}

const DistributionContext = createContext<DistributionContextType | undefined>(undefined);

export function DistributionProvider({ children }: { children: ReactNode }) {
  const [dist, setDist] = useState<DistributionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshDistribution = async () => {
    try {
      const res = await fetch('/api/distribution');
      const data = await res.json();
      setDist(data);
    } catch (err) {
      console.error('Failed to fetch distribution:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshDistribution();
    // Background polling for structural changes every 5s
    const interval = setInterval(refreshDistribution, 5000);
    return () => clearInterval(interval);
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

  return (
    <DistributionContext.Provider value={{
      dist, loading, refreshDistribution, toggleHook, isolateHook, disableAllHooks, resetHooks
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
