import * as ContextMenu from '@radix-ui/react-context-menu';
import { ChevronRight, Package } from 'lucide-react';
import type { DistributionHook } from '../types';

interface ProductionCodeSubMenuProps {
    hook: DistributionHook;
    onOpen: (hook: DistributionHook, level: 'baked' | 'minified', label: string) => void;
}

const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px', borderRadius: 6,
    fontSize: '0.75rem', color: '#c9d1d9',
    cursor: 'pointer', outline: 'none',
};

const subContentStyle: React.CSSProperties = {
    minWidth: 140,
    background: '#161b22',
    borderRadius: 8,
    padding: 4,
    border: '1px solid #30363d',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    zIndex: 1200,
};

/**
 * "View Production Code" submenu for the FidelityCloud node context menu.
 * Offers Readable (baked) and Minified output options.
 * Rendered as a Radix Sub inside an existing ContextMenu.Root.
 */
export default function ProductionCodeSubMenu({ hook, onOpen }: ProductionCodeSubMenuProps) {
    return (
        <ContextMenu.Sub>
            <ContextMenu.SubTrigger style={{ ...itemStyle, justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Package size={14} />
                    <span>View Production Code</span>
                </span>
                <ChevronRight size={12} color="#8b949e" />
            </ContextMenu.SubTrigger>

            <ContextMenu.Portal>
                <ContextMenu.SubContent style={subContentStyle} sideOffset={6}>
                    <ContextMenu.Item
                        style={itemStyle}
                        onClick={() => onOpen(hook, 'baked', 'Readable')}
                    >
                        Readable
                    </ContextMenu.Item>
                    <ContextMenu.Item
                        style={itemStyle}
                        onClick={() => onOpen(hook, 'minified', 'Minified')}
                    >
                        Minified
                    </ContextMenu.Item>
                </ContextMenu.SubContent>
            </ContextMenu.Portal>
        </ContextMenu.Sub>
    );
}
