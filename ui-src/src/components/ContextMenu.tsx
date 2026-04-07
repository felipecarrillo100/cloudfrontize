import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';

export interface MenuNode {
    id: string;
    label: string;
    icon?: React.ReactNode;
    color?: string;
    tooltip?: string;
    danger?: boolean;
    isSeparator?: boolean;
    children?: MenuNode[];
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: MenuNode[];
    title?: string;
    onClose: () => void;
    onAction: (id: string) => void;
}

const SUBMENU_WIDTH = 200;
const MENU_PADDING = 6;

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, title, onClose, onAction }) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [activePath, setActivePath] = useState<string[]>([]);
    const timerRef = useRef<any>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [onClose]);

    // Handle smooth transitions across infinite levels
    const handleMouseEnter = (path: string[]) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setActivePath(path);
    };

    const handleMouseLeave = () => {
        timerRef.current = setTimeout(() => {
            setActivePath([]);
        }, 300); // Forgiving grace period for diagonal movement
    };

    // Viewport intelligence for the root menu
    const adjustedX = Math.min(x, window.innerWidth - SUBMENU_WIDTH - 20);
    const adjustedY = Math.min(y, window.innerHeight - 400);

    return (
        <div 
            ref={menuRef}
            style={{ 
                position: 'fixed', top: adjustedY, left: adjustedX, zIndex: 9999,
                background: 'rgba(22, 27, 34, 0.95)', border: '1px solid #30363d',
                borderRadius: 8, padding: `${MENU_PADDING}px`, width: SUBMENU_WIDTH, 
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(10px)',
                userSelect: 'none'
            }}
        >
            {title && (
                <div style={{ padding: '4px 12px 8px', borderBottom: '1px solid #30363d', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.6rem', color: '#8b949e', fontWeight: 800, textTransform: 'uppercase' }}>{title}</span>
                    <X size={10} color="#8b949e" style={{ cursor: 'pointer' }} onClick={onClose} />
                </div>
            )}
            
            <MenuLayer 
                items={items} 
                level={0} 
                parentX={adjustedX} 
                onAction={onAction} 
                onClose={onClose}
                activePath={activePath}
                onHover={handleMouseEnter}
                onLeave={handleMouseLeave}
            />

            <style>{`
                .context-item:hover { background: #30363d !important; color: #f8fafc !important; }
            `}</style>
        </div>
    );
};

interface LayerProps {
    items: MenuNode[];
    level: number;
    parentX: number;
    activePath: string[];
    onAction: (id: string) => void;
    onClose: () => void;
    onHover: (path: string[]) => void;
    onLeave: () => void;
}

const MenuLayer: React.FC<LayerProps> = ({ items, level, parentX, activePath, onAction, onClose, onHover, onLeave }) => {
    return (
        <>
            {items.map((node, idx) => {
                const path = [...activePath.slice(0, level), node.id];
                const isActive = activePath[level] === node.id;
                const hasChildren = !!node.children?.length;

                if (node.isSeparator) {
                    return <div key={`sep-${idx}`} style={{ height: 1, background: '#30363d', margin: '4px 0' }} />;
                }

                return (
                    <div key={node.id} style={{ position: 'relative' }}>
                        <div 
                            title={node.tooltip}
                            onMouseEnter={() => onHover(path)}
                            onMouseLeave={onLeave}
                            onClick={(e) => { 
                                if (hasChildren) return;
                                e.stopPropagation(); 
                                onAction(node.id); 
                                onClose(); 
                            }}
                            style={{ 
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', 
                                cursor: 'pointer', borderRadius: 4, transition: 'all 0.2s',
                                color: node.danger ? '#ef4444' : '#d1d5db',
                                background: isActive ? '#30363d' : 'transparent',
                            }}
                            className="context-item"
                        >
                            {node.icon && <span style={{ display: 'flex', color: node.color || 'currentColor' }}>{node.icon}</span>}
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, flex: 1 }}>{node.label}</span>
                            {hasChildren && <ChevronRight size={12} color="#8b949e" />}
                        </div>

                        {hasChildren && isActive && (
                            <div 
                                onMouseEnter={() => onHover(path)}
                                onMouseLeave={onLeave}
                                style={{
                                    position: 'absolute', top: -MENU_PADDING,
                                    // Viewport Intelligence: Flip side if no space on right
                                    left: (parentX + SUBMENU_WIDTH + SUBMENU_WIDTH > window.innerWidth) 
                                        ? -(SUBMENU_WIDTH + 4) 
                                        : SUBMENU_WIDTH - 10, // Overlap for bridge
                                    width: SUBMENU_WIDTH,
                                    background: 'rgba(22, 27, 34, 0.98)', border: '1px solid #30363d',
                                    borderRadius: 8, padding: `${MENU_PADDING}px`, boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                                    backdropFilter: 'blur(10px)', zIndex: 1000 + level
                                }}
                            >
                                {/* Collision Bridge: Ensures no gap between levels */}
                                <div style={{ 
                                    position: 'absolute', 
                                    left: (parentX + SUBMENU_WIDTH + SUBMENU_WIDTH > window.innerWidth) ? SUBMENU_WIDTH : -10, 
                                    top: 0, bottom: 0, width: 10, background: 'transparent' 
                                }} />
                                
                                <MenuLayer 
                                    items={node.children!} 
                                    level={level + 1} 
                                    parentX={parentX + SUBMENU_WIDTH}
                                    activePath={activePath}
                                    onAction={onAction}
                                    onClose={onClose}
                                    onHover={onHover}
                                    onLeave={onLeave}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
};

export default ContextMenu;
