import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { DistributionHook } from '../types';
import { notify } from '../utils/notifications';

/**
 * State for the generic code panel.
 * Plain strings only — no domain types. Resolved content before the panel opens.
 */
export interface CodePanelState {
    title: string;
    subtitle: string;
    code: string;
    footerLeft?: string;
    footerRight?: string;
}

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

    // Generic code panel — replaces the hook-coupled activeHook
    activeCode: CodePanelState | null;
    activeStatusHook: DistributionHook | null;

    openMenu: (e: React.MouseEvent, title: string, items: ContextMenuItem[], metadata?: any, onAction?: (action: string) => void) => void;
    closeMenu: () => void;
    openDetail: (title: string, subTitle: string, content: any, path?: string) => void;
    closeDetail: () => void;

    /** Opens the code panel with the raw source of a hook (synchronous). */
    openCode: (hook: DistributionHook) => void;

    /** 
     * Opens the code panel with production-processed code (async fetch).
     * Fires a loading toast, fetches from /api/production-code, then opens panel on success.
     * On failure: error toast fires, panel does NOT open.
     */
    openProductionCode: (hook: DistributionHook, level: 'baked' | 'minified', label: string) => Promise<void>;

    closeCode: () => void;
    openStatus: (hook: DistributionHook) => void;
    closeStatus: () => void;
}

/**
 * Global UI state management for the CloudFrontize forensic dashboard.
 *
 * @namespace Frontend
 * This context manages the display state of transient UI elements:
 * - Contextual forensic menus (right-click)
 * - Side detail panels for deep object inspection
 * - Generic read-only code panel (source view, production builds, etc.)
 * - Status modal for hook health
 *
 * Trigger → UIContext (state) → App.tsx (render outlet)
 */
const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
    const [contextMenu, setContextMenu] = useState<UIContextType['contextMenu']>(null);
    const [detailPanel, setDetailPanel] = useState<UIContextType['detailPanel']>(null);
    const [activeCode, setActiveCode] = useState<CodePanelState | null>(null);
    const [activeStatusHook, setActiveStatusHook] = useState<DistributionHook | null>(null);

    const openMenu = (e: React.MouseEvent, title: string, items: ContextMenuItem[], metadata?: any, onAction?: (action: string) => void) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, title, items, metadata, onAction });
    };

    const closeMenu = () => setContextMenu(null);

    const openDetail = (title: string, subTitle: string, content: any, path?: string) => {
        setDetailPanel({ title, subTitle, content, path });
    };

    const closeDetail = () => setDetailPanel(null);

    /** Synchronous — maps hook fields directly to CodePanelState. */
    const openCode = (hook: DistributionHook) => {
        setActiveCode({
            title: hook.path.split(/[\\\/]/).pop() || hook.path,
            subtitle: `${hook.type} • Read Only`,
            code: hook.code,
            footerLeft: hook.path,
            footerRight: 'Hot reload active (IDE mirrored)',
        });
    };

    /** Async — fetches production code, opens panel only on success. */
    const openProductionCode = async (hook: DistributionHook, level: 'baked' | 'minified', label: string) => {
        const toastId = notify.loading('Building production output...');
        try {
            const res = await fetch(`/api/production-code?id=${hook.id}&level=${level}`);
            if (!res.ok) throw new Error(`Server responded with ${res.status}`);
            const code = await res.text();
            notify.dismiss(toastId);
            setActiveCode({
                title: hook.path.split(/[\\\/]/).pop() || hook.path,
                subtitle: `Production Build • ${label}`,
                code,
                footerLeft: hook.path,
                footerRight: `${label} output`,
            });
        } catch (e: any) {
            notify.dismiss(toastId);
            notify.error(`Failed to fetch production code: ${e.message}`);
            // Panel intentionally does NOT open on failure
        }
    };

    const closeCode = () => setActiveCode(null);

    const openStatus = (hook: DistributionHook) => setActiveStatusHook(hook);
    const closeStatus = () => setActiveStatusHook(null);

    return (
        <UIContext.Provider value={{
            contextMenu, detailPanel, activeCode, activeStatusHook,
            openMenu, closeMenu, openDetail, closeDetail,
            openCode, openProductionCode, closeCode,
            openStatus, closeStatus,
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
