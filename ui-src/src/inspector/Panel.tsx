import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useUI } from '@/state/ui'

/** The inspector's frame: a title, a close button and scrolling content. */
export function Panel({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  const select = useUI(s => s.select)
  return (
    <aside aria-label={`${title} inspector`} className="flex h-full flex-col">
      <div className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
        </div>
        <button type="button" onClick={() => select(null)} aria-label="Close inspector" className="ml-auto rounded p-1 text-muted hover:bg-surface-2 hover:text-text">
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  )
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}
