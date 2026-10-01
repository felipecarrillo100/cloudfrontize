import { useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Distribution } from '@contract'
import { useProject } from '@/api/queries'
import { reportEditError, useManifestEdit } from '@/api/mutations'
import { Button } from '@/components/ui/Button'
import { useDialogs } from '@/state/dialogs'
import { useUI } from '@/state/ui'
import { Panel, Section } from './Panel'

const SETTINGS: { key: string; label: string; hint: string; fallback: boolean }[] = [
  { key: 'strict', label: 'Strict mode', hint: 'Fail requests that break AWS rules (502), instead of warning. Timing only warns.', fallback: false },
  { key: 'compression', label: 'Compression', hint: 'Compress responses for viewers that accept it', fallback: true },
  { key: 'etag', label: 'ETag', hint: 'Send ETag headers from the origin', fallback: true },
  { key: 'spa', label: 'Single-page app', hint: 'Serve index.html (200) when the origin returns 404 or 403', fallback: false },
  { key: 'cors', label: 'CORS', hint: 'Allow cross-origin requests to the distribution (local development aid)', fallback: false },
  { key: 'requestLogging', label: 'Request logging', hint: 'One line per request in the terminal', fallback: true },
]

/** Distribution settings and its cache behaviors, in match order. */
export function DistributionInspector({ dist, editable }: { dist: Distribution; editable: boolean }) {
  const project = useProject(editable)
  const edit = useManifestEdit()
  const openDialog = useDialogs(s => s.open)
  const showBehavior = useUI(s => s.showBehavior)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const settings = (project.data?.manifest.distribution ?? {}) as Record<string, unknown>
  const patterns = dist.behaviors.filter(b => b.pathPattern !== null)

  const set = (key: string, value: boolean) => edit.mutate(m => { m.distribution = { ...(m.distribution ?? {}), [key]: value } }, { onError: reportEditError })
  const move = (index: number, delta: number) => edit.mutate(m => {
    const list = m.behaviors ?? []
    const [b] = list.splice(index, 1)
    list.splice(index + delta, 0, b)
  }, { onError: reportEditError })
  const remove = (pattern: string) => edit.mutate(m => { m.behaviors = (m.behaviors ?? []).filter(b => b.pathPattern !== pattern) }, {
    onSuccess: () => { setConfirmDelete(null); showBehavior('default') },
    onError: reportEditError,
  })

  return (
    <Panel title="Distribution" subtitle={dist.project?.name}>
      {editable && (
        <Section title="Settings">
          <ul className="flex flex-col gap-2.5">
            {SETTINGS.map(s => (
              <li key={s.key}>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" disabled={edit.isPending} checked={(settings[s.key] as boolean | undefined) ?? s.fallback} onChange={e => set(s.key, e.target.checked)} />
                  <span>{s.label}<span className="block text-xs text-muted">{s.hint}</span></span>
                </label>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Cache behaviors" action={editable && <Button size="sm" variant="ghost" onClick={() => openDialog('behavior', { key: null })}><Plus size={12} /> Add</Button>}>
        <p className="mb-2 text-xs text-muted">Matched top to bottom on the viewer's path; the first match wins.</p>
        <ol className="flex flex-col gap-1">
          {patterns.map((b, i) => (
            <li key={b.key} className="flex items-center gap-1 rounded-md border border-line px-2 py-1.5">
              <span className="w-4 text-xs text-muted">{i + 1}</span>
              <button type="button" onClick={() => showBehavior(b.key)} className="min-w-0 flex-1 truncate text-left font-mono text-xs hover:underline">{b.pathPattern}</button>
              <span className="truncate text-xs text-muted">→ {b.origin}</span>
              {editable && (confirmDelete === b.key ? (
                <span className="flex items-center gap-1">
                  <Button size="sm" variant="danger" onClick={() => remove(b.key)}>Delete</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Keep</Button>
                </span>
              ) : (
                <span className="flex items-center">
                  <button type="button" aria-label={`Move ${b.pathPattern} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:bg-surface-2 disabled:opacity-30"><ArrowUp size={13} /></button>
                  <button type="button" aria-label={`Move ${b.pathPattern} down`} disabled={i === patterns.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-muted hover:bg-surface-2 disabled:opacity-30"><ArrowDown size={13} /></button>
                  <button type="button" aria-label={`Edit ${b.pathPattern}`} onClick={() => openDialog('behavior', { key: b.key })} className="rounded p-1 text-muted hover:bg-surface-2"><Pencil size={13} /></button>
                  <button type="button" aria-label={`Delete ${b.pathPattern}`} onClick={() => setConfirmDelete(b.key)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-danger"><Trash2 size={13} /></button>
                </span>
              ))}
            </li>
          ))}
          <li className="flex items-center gap-1 rounded-md border border-dashed border-line px-2 py-1.5">
            <span className="w-4" />
            <button type="button" onClick={() => showBehavior('default')} className="flex-1 text-left font-mono text-xs hover:underline">Default (*)</button>
            <span className="text-xs text-muted">→ {dist.behaviors[dist.behaviors.length - 1]?.origin}</span>
          </li>
        </ol>
      </Section>

      {typeof settings.port === 'number' && <p className="text-xs text-muted">Port {String(settings.port)} (applies when CloudFrontize starts).</p>}
    </Panel>
  )
}
