import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Generic read-only code panel.
 *
 * Knows nothing about hooks, production builds, or any domain concept.
 * All callers are responsible for resolving the content before passing it in.
 * Can be used for any read-only text display: source code, production builds,
 * request/response bodies, configs, etc.
 */
export interface CodeViewerProps {
    title: string;           // e.g. "3.1-bouncer.js"
    subtitle: string;        // e.g. "Lambda@Edge • Read Only" | "Production Build • Readable"
    code: string;            // the text to display
    footerLeft?: string;     // e.g. full file path
    footerRight?: string;    // e.g. "Hot reload active"
    icon?: React.ReactNode;  // header icon (defaults to ⚡)
    onClose: () => void;
}

export default function CodeViewer({ title, subtitle, code, footerLeft, footerRight, icon, onClose }: CodeViewerProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1100,
                display: 'flex', justifyContent: 'flex-end',
                background: 'var(--pro-modal-overlay)',
                backdropFilter: 'blur(var(--pro-modal-blur))',
            }}
            onClick={onClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '50%', maxWidth: 800,
                    background: 'var(--pro-modal-bg)',
                    borderLeft: '1px solid var(--pro-modal-border)',
                    display: 'flex', flexDirection: 'column',
                    boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
                }}
            >
                {/* Header */}
                <header style={{
                    padding: '1rem 1.5rem',
                    background: 'var(--pro-modal-header)',
                    borderBottom: '1px solid var(--pro-modal-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: 'rgba(249,115,22,0.1)',
                            border: '1px solid rgba(249,115,22,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <span style={{ fontSize: '1rem' }}>{icon ?? '⚡'}</span>
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--pro-text-main)' }}>
                                {title}
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--pro-text-dim)' }}>
                                {subtitle}
                            </p>
                        </div>
                    </div>

                    {/* Controls: Copy + Close */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                            onClick={handleCopy}
                            title={copied ? 'Copied!' : 'Copy to clipboard'}
                            style={{
                                background: copied ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : '#30363d'}`,
                                borderRadius: 6, padding: '5px 8px',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                color: copied ? '#22c55e' : '#8b949e',
                                fontSize: '0.7rem', fontWeight: 600,
                                transition: 'all 0.2s',
                            }}
                        >
                            {copied
                                ? <><Check size={13} /> Copied</>
                                : <><Copy size={13} /> Copy</>
                            }
                        </button>
                        <button
                            onClick={onClose}
                            style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
                        >
                            ×
                        </button>
                    </div>
                </header>

                {/* Code Body */}
                <div style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
                    <pre style={{
                        margin: 0, fontSize: '0.85rem',
                        fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
                        lineHeight: 1.6, color: '#c9d1d9', whiteSpace: 'pre-wrap',
                    }}>
                        {code}
                    </pre>
                </div>

                {/* Footer */}
                <footer style={{
                    padding: '0.75rem 1.5rem',
                    borderTop: '1px solid var(--pro-modal-border)',
                    color: '#484f58', fontSize: '0.65rem',
                    display: 'flex', justifyContent: 'space-between',
                }}>
                    <span>{footerLeft}</span>
                    <span>{footerRight}</span>
                </footer>
            </div>
        </div>
    );
}
