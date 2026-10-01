import { style } from '../core/Logger';
import { Diagnostic } from './errors';

const ORDER: Diagnostic['severity'][] = ['error', 'warning', 'info'];
const LABEL = {
    error: (s: string) => style.red(s),
    warning: (s: string) => style.yellow(s),
    info: (s: string) => style.cyan(s)
};

/** Human-readable diagnostics, grouped by severity, each with its location in the manifest. */
export function formatDiagnostics(diagnostics: Diagnostic[]): string {
    const lines: string[] = [];
    for (const severity of ORDER) {
        const group = diagnostics.filter(d => d.severity === severity);
        if (!group.length) continue;
        lines.push(LABEL[severity](`${group.length} ${severity}${group.length === 1 ? '' : 's'}:`));
        for (const d of group) lines.push(`  ${style.gray(d.path || '/')}  ${d.message} ${style.gray(`[${d.rule}]`)}`);
    }
    return lines.join('\n');
}
