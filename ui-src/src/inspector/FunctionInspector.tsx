import { AlertCircle, CheckCircle2, ExternalLink, FileOutput, Pencil, Trash2 } from 'lucide-react'
import type { DistributionFunction } from '@contract'
import { useControl, useFunctionDetail, useProject } from '@/api/queries'
import { reportEditError, useOpenInEditor, useUpdateFunction } from '@/api/mutations'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { CFF_RUNTIMES, LAE_RUNTIMES } from '@/functions/ids'
import { typeName } from '@/schematic/rules'
import { useDialogs } from '@/state/dialogs'
import { useUI } from '@/state/ui'
import { cn } from '@/lib/cn'
import { Panel, Section } from './Panel'

const CFF_LIMIT = 10 * 1024

function SizeMeter({ size }: { size: number }) {
  const ratio = Math.min(size / CFF_LIMIT, 1)
  const tone = size > CFF_LIMIT ? 'bg-danger' : ratio > 0.8 ? 'bg-warn' : 'bg-ok'
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs"><span>{(size / 1024).toFixed(1)} KB of 10 KB</span><span className="text-muted">AWS limit, not adjustable</span></div>
      <div className="h-1.5 overflow-hidden rounded bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={CFF_LIMIT} aria-valuenow={size} aria-label="Function size">
        <div className={cn('h-full', tone)} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

/** A function: build state, runtime, key value store, size, and where it runs. */
export function FunctionInspector({ fn, editable }: { fn: DistributionFunction; editable: boolean }) {
  const detail = useFunctionDetail(fn.id, editable)
  const project = useProject(editable)
  const control = useControl()
  const update = useUpdateFunction()
  const openInEditor = useOpenInEditor()
  const dialogs = useDialogs()
  const showBehavior = useUI(s => s.showBehavior)
  const stores = Object.keys((project.data?.manifest.keyValueStores ?? {}) as Record<string, unknown>)
  const isCff = fn.type === 'cloudfront-function'
  const runtimes = isCff ? CFF_RUNTIMES : LAE_RUNTIMES
  const runtime = detail.data?.runtime ?? fn.runtime ?? runtimes[0].value

  return (
    <Panel title={fn.id} subtitle={<Badge tone={isCff ? 'cff' : 'lae'}>{typeName[fn.type]}</Badge>}>
      <Section title="Build">
        {fn.build.status === 'ok' && <p className="flex items-center gap-2 text-sm text-ok"><CheckCircle2 size={15} aria-hidden /> Built and running</p>}
        {fn.build.status === 'unused' && <p className="text-sm text-muted">Not attached to any behavior, so it doesn't run.</p>}
        {(fn.build.status === 'error' || fn.build.status === 'missing') && (
          <div role="alert" className="rounded-md border border-danger/40 p-2.5 text-sm">
            <p className="mb-1 flex items-center gap-2 font-medium text-danger"><AlertCircle size={15} aria-hidden /> {fn.build.status === 'missing' ? 'File missing' : `Build error${fn.build.error?.line ? ` on line ${fn.build.error.line}` : ''}`}</p>
            <p className="font-mono text-xs break-words">{fn.build.error?.message}</p>
          </div>
        )}
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!fn.disabled} onChange={() => control.mutate({ action: fn.disabled ? 'enable' : 'disable', function: fn.id })} />
          Enabled <span className="text-xs text-muted">(switching off for testing isn't saved)</span>
        </label>
      </Section>

      <Section title="Code">
        <p className="mb-2 break-all font-mono text-xs text-muted">{fn.file ?? fn.path}</p>
        {isCff && detail.data?.size != null && <div className="mb-3"><SizeMeter size={detail.data.size} /></div>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => openInEditor.mutate(fn.id)}><ExternalLink size={13} /> Open in VS Code</Button>
          <Button size="sm" onClick={() => dialogs.open('production', fn.id)}><FileOutput size={13} /> Production build</Button>
        </div>
      </Section>

      {editable && (
        <Section title="Settings">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">Runtime
              <Select value={runtime} onChange={e => update.mutate({ id: fn.id, runtime: e.target.value }, { onError: reportEditError })}>
                {runtimes.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </label>
            {isCff && (
              <label className="flex flex-col gap-1 text-xs text-muted">Key value store
                <Select value={detail.data?.keyValueStore ?? ''} disabled={runtime !== 'cloudfront-js-2.0'}
                  onChange={e => update.mutate({ id: fn.id, keyValueStore: e.target.value || null }, { onError: reportEditError })}>
                  <option value="">None</option>
                  {stores.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
                {runtime !== 'cloudfront-js-2.0' && <span>Key value stores need runtime 2.0.</span>}
              </label>
            )}
          </div>
        </Section>
      )}

      {detail.data && (
        <Section title="Runs on">
          {detail.data.attachments.length === 0 && <p className="text-sm text-muted">No behavior uses it yet.</p>}
          <ul className="flex flex-col gap-1">
            {detail.data.attachments.map(a => (
              <li key={`${a.behavior}-${a.event}`}>
                <button type="button" onClick={() => showBehavior(a.behavior)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-surface-2">
                  <span className="font-mono text-xs">{a.behavior === 'default' ? 'Default (*)' : a.behavior}</span>
                  <span className="ml-auto font-mono text-xs text-muted">{a.event}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {editable && (
        <div className="flex gap-2 border-t border-line pt-4">
          <Button size="sm" onClick={() => dialogs.open('rename', fn.id)}><Pencil size={13} /> Rename</Button>
          <Button size="sm" variant="danger" onClick={() => dialogs.open('remove', fn)}><Trash2 size={13} /> Delete</Button>
        </div>
      )}
    </Panel>
  )
}
