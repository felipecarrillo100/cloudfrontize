import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { MenuNode } from './ContextMenu';

interface ToolbarDropdownProps {
  label: string;
  items: MenuNode[];
  onAction: (id: string) => void;
  align?: 'left' | 'right';
  disabled?: boolean;
}

const ToolbarDropdown: React.FC<ToolbarDropdownProps> = ({ 
  label, 
  items, 
  onAction, 
  align = 'right',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen(!isOpen);
  };

  const handleItemClick = (id: string) => {
    onAction(id);
    setIsOpen(false);
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button 
        onClick={handleToggle}
        disabled={disabled}
        title={`Expand ${label} menu`}
        style={{ 
          display: 'flex', alignItems: 'center', gap: 6, 
          background: '#0d1117', border: '1px solid #30363d', 
          color: isOpen ? '#f97316' : '#8b949e', 
          padding: '4px 10px', borderRadius: 6, 
          fontSize: '0.6rem', fontWeight: 800, 
          cursor: disabled ? 'not-allowed' : 'pointer', 
          textTransform: 'uppercase', letterSpacing: '0.05em', 
          transition: 'all 0.2s',
          borderColor: isOpen ? '#f9731666' : '#30363d',
          opacity: disabled ? 0.4 : 1
        }}
      >
        {label} {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {isOpen && (
        <div style={{ 
          position: 'absolute', top: '100%', 
          [align]: 0, 
          marginTop: 8, 
          background: 'rgba(22, 27, 34, 0.98)', border: '1px solid #30363d', 
          borderRadius: 8, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', 
          zIndex: 100, padding: '4px', minWidth: 180, 
          backdropFilter: 'blur(10px)' 
        }}>
          {items.map((node) => (
            <button 
              key={node.id}
              onClick={() => handleItemClick(node.id)}
              style={{ 
                width: '100%', textAlign: 'left', background: 'none', 
                border: 'none', color: '#c9d1d9', padding: '8px 12px', 
                fontSize: '0.7rem', borderRadius: 4, cursor: 'pointer', 
                display: 'flex', alignItems: 'center', gap: 10 
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#30363d'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {node.icon && <span style={{ display: 'flex', color: node.color || 'currentColor' }}>{node.icon}</span>}
              <span style={{ fontWeight: 600 }}>{node.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolbarDropdown;
