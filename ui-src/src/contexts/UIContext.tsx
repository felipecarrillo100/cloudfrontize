import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { DistributionHook } from '../types';

interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  tooltip?: string;
}

interface UIContextType {
  contextMenu: {
    x: number;
    y: number;
    title: string;
    items: ContextMenuItem[];
    metadata?: any;
    onAction?: (action: string) => void;
  } | null;
  detailPanel: {
    title: string;
    subTitle: string;
    content: any;
    path?: string;
  } | null;
  activeHook: DistributionHook | null;
  
  openMenu: (e: React.MouseEvent, title: string, items: ContextMenuItem[], metadata?: any, onAction?: (action: string) => void) => void;
  closeMenu: () => void;
  openDetail: (title: string, subTitle: string, content: any, path?: string) => void;
  closeDetail: () => void;
  openCode: (hook: DistributionHook) => void;
  closeCode: () => void;
}

/**
 * Global UI state management for the CloudFrontize forensic dashboard.
 * 
 * @namespace Frontend
 * This context manages the display state of transient UI elements such as:
 * - Contextual forensic menus (right-click).
 * - Side detail panels for deep object inspection.
 * - Code viewer modals for Lambda@Edge/CFF source code analysis.
 */
const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
  const [contextMenu, setContextMenu] = useState<UIContextType['contextMenu']>(null);
  const [detailPanel, setDetailPanel] = useState<UIContextType['detailPanel']>(null);
  const [activeHook, setActiveHook] = useState<DistributionHook | null>(null);

  const openMenu = (e: React.MouseEvent, title: string, items: ContextMenuItem[], metadata?: any, onAction?: (action: string) => void) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, title, items, metadata, onAction });
  };

  const closeMenu = () => setContextMenu(null);
  
  const openDetail = (title: string, subTitle: string, content: any, path?: string) => {
    setDetailPanel({ title, subTitle, content, path });
  };
  
  const closeDetail = () => setDetailPanel(null);

  const openCode = (hook: DistributionHook) => setActiveHook(hook);
  const closeCode = () => setActiveHook(null);

  return (
    <UIContext.Provider value={{
      contextMenu, detailPanel, activeHook,
      openMenu, closeMenu, openDetail, closeDetail, openCode, closeCode
    }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) throw new Error('useUI must be used within a UIProvider');
  return context;
}
