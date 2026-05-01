import { useState, useRef, useEffect } from 'react';
import { Copy, Check, WrapText } from 'lucide-react';
import { Highlight, themes } from 'prism-react-renderer';

/**
 * Generic size limit descriptor.
 * Caller provides both the ceiling (bytes) and a display label.
 * CodeViewer has no knowledge of what the limit represents.
 */
export interface SizeLimit {
    bytes: number;   // e.g. 10240 for CFF's 10KB
    label: string;   // e.g. "CFF Limit" — displayed in footer
}

/**
 * Generic read-only code panel.
 *
 * Domain-agnostic: knows nothing about hooks, production builds, AWS, or CFF limits.
 * All callers resolve content before passing it in.
 *
 * Features:
 * - Syntax highlighting + line numbers (prism-react-renderer / JavaScript)
 * - Word wrap toggle (critical for minified single-line output)
 * - Copy to clipboard with visual confirmation
 * - Highlight-at-line: scrolls to and marks a specific line on open
 * - KB counter with optional size limit indicator (caller provides limit)
 */
export interface CodeViewerProps {
    title: string;              // e.g. "3.1-bouncer.js"
    subtitle: string;           // e.g. "Lambda@Edge • Read Only"
    code: string;               // the text to display
    footerLeft?: string;        // e.g. full file path
    footerRight?: string;       // e.g. "Hot reload active"
    icon?: React.ReactNode;     // header icon (defaults to ⚡)
    highlightLine?: number;     // 1-indexed line to scroll to and highlight on open
    sizeLimit?: SizeLimit;      // if provided, show size vs. limit indicator in footer
    onClose: () => void;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function CodeViewer({
    title, subtitle, code, footerLeft, footerRight,
    icon, highlightLine, sizeLimit, onClose
}: CodeViewerProps) {
    const [copied, setCopied] = useState(false);
    const [wrapped, setWrapped] = useState(true);
    const highlightRef = useRef<HTMLDivElement | null>(null);

    // Scroll to the highlighted line once on open
    useEffect(() => {
        if (highlightRef.current) {
            highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, []);

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const byteSize = new Blob([code]).size;
    const pct = sizeLimit ? (byteSize / sizeLimit.bytes) * 100 : 0;
    const sizeColor = !sizeLimit
        ? '#484f58'
        : pct >= 90 ? '#ef4444'
        : pct >= 70 ? '#f59e0b'
        : '#22c55e';

    const btnBase: React.CSSProperties = {
        borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', transition: 'all 0.2s',
        fontSize: '0.7rem', fontWeight: 600,
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
                {/* ── Header ── */}
                <header style={{
                    padding: '1rem 1.5rem', flexShrink: 0,
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

                    {/* Controls: Wrap · Copy · Close */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                            onClick={() => setWrapped(w => !w)}
                            title={wrapped ? 'Disable word wrap' : 'Enable word wrap'}
                            style={{
                                ...btnBase,
                                background: wrapped ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${wrapped ? 'rgba(249,115,22,0.3)' : '#30363d'}`,
                                color: wrapped ? '#f97316' : '#8b949e',
                            }}
                        >
                            <WrapText size={13} />
                        </button>

                        <button
                            onClick={handleCopy}
                            title={copied ? 'Copied!' : 'Copy to clipboard'}
                            style={{
                                ...btnBase,
                                gap: 5,
                                background: copied ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : '#30363d'}`,
                                color: copied ? '#22c55e' : '#8b949e',
                            }}
                        >
                            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                        </button>

                        <button
                            onClick={onClose}
                            style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
                        >
                            ×
                        </button>
                    </div>
                </header>

                {/* ── Code Body ── */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                    <Highlight theme={themes.vsDark} code={code.trimEnd()} language="javascript">
                        {({ tokens, getLineProps, getTokenProps }) => {
                            const lineNumWidth = `${String(tokens.length).length + 1}ch`;
                            return (
                                <pre style={{
                                    margin: 0, padding: '1rem 0',
                                    background: 'transparent',
                                    fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
                                    fontSize: '0.82rem', lineHeight: 1.65,
                                    whiteSpace: wrapped ? 'pre-wrap' : 'pre',
                                    overflowX: wrapped ? 'hidden' : 'auto',
                                }}>
                                    {tokens.map((line, i) => {
                                        const lineNum = i + 1;
                                        const isHighlighted = lineNum === highlightLine;
                                        const lineProps = getLineProps({ line });
                                        return (
                                            <div
                                                key={i}
                                                ref={isHighlighted ? highlightRef : undefined}
                                                {...lineProps}
                                                style={{
                                                    ...lineProps.style,
                                                    display: 'flex',
                                                    background: isHighlighted ? 'rgba(249,115,22,0.12)' : 'transparent',
                                                    borderLeft: isHighlighted ? '2px solid #f97316' : '2px solid transparent',
                                                    paddingRight: '1.5rem',
                                                }}
                                            >
                                                {/* Line number */}
                                                <span style={{
                                                    userSelect: 'none', flexShrink: 0,
                                                    minWidth: lineNumWidth,
                                                    paddingLeft: '1rem', paddingRight: '1.25rem',
                                                    color: isHighlighted ? '#f97316aa' : '#3d444d',
                                                    textAlign: 'right',
                                                }}>
                                                    {lineNum}
                                                </span>
                                                {/* Tokens */}
                                                <span style={{ flex: 1 }}>
                                                    {line.map((token, key) => (
                                                        <span key={key} {...getTokenProps({ token })} />
                                                    ))}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </pre>
                            );
                        }}
                    </Highlight>
                </div>

                {/* ── Footer ── */}
                <footer style={{
                    padding: '0.75rem 1.5rem', flexShrink: 0,
                    borderTop: '1px solid var(--pro-modal-border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: '0.65rem',
                }}>
                    <span style={{ color: '#484f58' }}>{footerLeft}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Size counter */}
                        <span style={{ color: sizeColor, fontWeight: 600 }}>
                            {formatBytes(byteSize)}
                            {sizeLimit && (
                                <span style={{ color: '#484f58', fontWeight: 400 }}>
                                    {' '}/ {formatBytes(sizeLimit.bytes)} {sizeLimit.label}
                                </span>
                            )}
                        </span>
                        {footerRight && <span style={{ color: '#484f58' }}>{footerRight}</span>}
                    </div>
                </footer>
            </div>
        </div>
    );
}
