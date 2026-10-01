import { AlertTriangle, Info, XCircle } from 'lucide-react'
import type { Diagnostic } from '@contract'

const icon = {
  error: <XCircle size={14} className="mt-0.5 shrink-0 text-danger" aria-label="Error" />,
  warning: <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-label="Warning" />,
  info: <Info size={14} className="mt-0.5 shrink-0 text-muted" aria-label="Info" />,
}
const order = { error: 0, warning: 1, info: 2 }

/** Manifest diagnostics, errors first, each with where it is in cloudfrontize.json. */
export function DiagnosticsList({ diagnostics, empty }: { diagnostics: Diagnostic[]; empty?: string }) {
  if (diagnostics.length === 0) return empty ? <p className="text-sm text-muted">{empty}</p> : null
  return (
    <ul className="flex flex-col gap-1.5">
      {[...diagnostics].sort((a, b) => order[a.severity] - order[b.severity]).map((d, i) => (
        <li key={i} className="flex gap-2 text-sm">
          {icon[d.severity]}
          <span>
            {d.message}
            {d.path && <code className="ml-2 font-mono text-xs text-muted">{d.path}</code>}
          </span>
        </li>
      ))}
    </ul>
  )
}
