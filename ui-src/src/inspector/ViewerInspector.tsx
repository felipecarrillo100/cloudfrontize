import * as Menu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'
import { ChevronDown, Info, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiRequestError, errorMessage } from '@/api/client'
import { useSaveViewerHeaders, useViewerHeaders } from '@/api/mutations'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Panel, Section } from './Panel'
import { DEVICE_PRESETS, GEO_PRESETS, type Preset } from './presets'
import { applyPreset, headerProblems, isCloudFrontAdded, parseHeaders, serializeHeaders, type HeaderRow } from './viewerHeaders'

const menuItem = 'flex cursor-default select-none items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2'

function PresetMenu({ label, presets, onApply }: { label: string; presets: Preset[]; onApply(p: Preset): void }) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild><Button size="sm">{label} <ChevronDown size={12} /></Button></Menu.Trigger>
      <Menu.Portal>
        <Menu.Content sideOffset={4} className="z-50 min-w-44 rounded-md border border-line bg-surface p-1 shadow-lg">
          {presets.map(p => <Menu.Item key={p.label} className={menuItem} onSelect={() => onApply(p)}>{p.label}</Menu.Item>)}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

function Editor({ initial, file, revision, editable }: { initial: HeaderRow[]; file: string | null; revision: string | null; editable: boolean }) {
  const [rows, setRows] = useState(initial)
  const save = useSaveViewerHeaders()
  const dirty = serializeHeaders(rows) !== serializeHeaders(initial)
  const problems = headerProblems(rows)
  const update = (i: number, change: Partial<HeaderRow>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...change } : r)))

  const onSave = () => save.mutate({ content: serializeHeaders(rows), revision }, {
    onSuccess: () => toast.success('Viewer simulation saved and applied'),
    onError: err => toast.error(err instanceof ApiRequestError && err.status === 409 ? 'The file changed on disk meanwhile; it has been reloaded' : errorMessage(err)),
  })

  return (
    <>
      <Section title="Presets">
        <div className="flex flex-wrap gap-2">
          <PresetMenu label="Location" presets={GEO_PRESETS} onApply={p => setRows(rs => applyPreset(rs, p.headers, 'cloudfront-viewer-'))} />
          <PresetMenu label="Device" presets={DEVICE_PRESETS} onApply={p => setRows(rs => applyPreset(rs, p.headers, 'cloudfront-is-'))} />
        </div>
      </Section>

      <Section title="Headers" action={editable && (
        <Button size="sm" variant="ghost" onClick={() => setRows(rs => [...rs, { key: '', value: '', target: 'request' }])}><Plus size={12} /> Add</Button>
      )}>
        {rows.length === 0 && <p className="text-sm text-muted">No simulated headers: requests arrive exactly as the client sends them.</p>}
        <ul className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <li key={i} className="flex flex-col gap-1 rounded-md border border-line p-2">
              <div className="flex items-center gap-1.5">
                <input aria-label="Header name" value={row.key} disabled={!editable} onChange={e => update(i, { key: e.target.value })}
                  className="h-7 min-w-0 flex-1 rounded border border-line bg-bg px-2 font-mono text-xs" placeholder="Header-Name" />
                <select aria-label="Applies to" value={row.target} disabled={!editable} onChange={e => update(i, { target: e.target.value as HeaderRow['target'] })}
                  className="h-7 rounded border border-line bg-bg px-1 text-xs">
                  <option value="request">request</option>
                  <option value="response">origin response</option>
                </select>
                {editable && <button type="button" aria-label={`Remove ${row.key || 'header'}`} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                  className="rounded p-1 text-muted hover:bg-surface-2 hover:text-danger"><Trash2 size={13} /></button>}
              </div>
              <input aria-label={`Value of ${row.key || 'header'}`} value={row.value} disabled={!editable} onChange={e => update(i, { value: e.target.value })}
                className="h-7 rounded border border-line bg-bg px-2 font-mono text-xs" />
              {row.target === 'request' && isCloudFrontAdded(row.key) && (
                <Badge tone="accent" className="self-start" title="Lambda@Edge sees this header only in origin request and origin response; CloudFront Functions see it on viewer events too">
                  CloudFront adds this
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {problems.length > 0 && <ul role="alert" className="mb-3 text-xs text-danger">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
      {editable && (
        <div className="flex items-center gap-2">
          <Button variant="primary" disabled={!dirty || problems.length > 0 || save.isPending} onClick={onSave}>{save.isPending ? 'Saving…' : 'Save'}</Button>
          <Button variant="ghost" disabled={!dirty} onClick={() => setRows(initial)}>Revert</Button>
          <span className="ml-auto truncate font-mono text-[11px] text-muted">{file ?? 'saves to config/headers.json'}</span>
        </div>
      )}
    </>
  )
}

/** The viewer simulation: the headers CloudFront and the viewer would send, applied to every request. */
export function ViewerInspector({ editable }: { editable: boolean }) {
  const file = useViewerHeaders(editable)
  return (
    <Panel title="Viewer" subtitle="What every request looks like when it reaches CloudFront">
      <p className="mb-4 flex gap-2 rounded-md bg-surface-2 p-2.5 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>Headers <em>CloudFront adds</em> (location, device…) follow AWS: Lambda@Edge viewer functions don't see them, origin functions and CloudFront Functions do. A value CloudFront adds overrides one the client sends.</span>
      </p>
      {!editable && <p className="text-sm text-muted">2.x setups set these with <code className="font-mono">--headers</code>.</p>}
      {editable && file.isLoading && <Spinner />}
      {editable && file.error && <p role="alert" className="text-sm text-danger">{errorMessage(file.error)}</p>}
      {editable && file.data && (() => {
        let initial: HeaderRow[]
        try { initial = parseHeaders(file.data.content) } catch { return <p role="alert" className="text-sm text-danger">{file.data.file} isn't valid JSON. Fix it in an editor; it's applied when saved.</p> }
        return <Editor key={file.data.revision ?? 'new'} initial={initial} file={file.data.file} revision={file.data.revision} editable={editable} />
      })()}
    </Panel>
  )
}
