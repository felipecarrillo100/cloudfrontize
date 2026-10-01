import * as Menu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'
import { ChevronDown, Info, Plus, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiRequestError, errorMessage } from '@/api/client'
import { useInvoke, useSaveViewerHeaders, useSaveViewerSimulation, useViewerHeaders, useViewerSimulation } from '@/api/mutations'
import { statusTone } from '@/traffic/journey'
import { useTrafficUI } from '@/traffic/store'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Panel, Section } from './Panel'
import { DEVICE_PRESETS, GEO_PRESETS, type Preset } from './presets'
import { applyPreset, headerProblems, isCloudFrontAdded, parseHeaderLines, parseHeaders, serializeHeaders, type HeaderRow } from './viewerHeaders'

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

function Editor({ initial, note, onSave, saving }: { initial: HeaderRow[]; note: string; onSave(rows: HeaderRow[]): void; saving: boolean }) {
  const [rows, setRows] = useState(initial)
  const editable = true
  const dirty = serializeHeaders(rows) !== serializeHeaders(initial)
  const problems = headerProblems(rows)
  const update = (i: number, change: Partial<HeaderRow>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...change } : r)))

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
          <Button variant="primary" disabled={!dirty || problems.length > 0 || saving} onClick={() => onSave(rows)}>{saving ? 'Saving…' : 'Save'}</Button>
          <Button variant="ghost" disabled={!dirty} onClick={() => setRows(initial)}>Revert</Button>
          <span className="ml-auto truncate font-mono text-[11px] text-muted">{note}</span>
        </div>
      )}
    </>
  )
}

function FileSimulation() {
  const file = useViewerHeaders(true)
  const save = useSaveViewerHeaders()
  if (file.isLoading) return <Spinner />
  if (file.error) return <p role="alert" className="text-sm text-danger">{errorMessage(file.error)}</p>
  if (!file.data) return null
  let initial: HeaderRow[]
  try { initial = parseHeaders(file.data.content) } catch { return <p role="alert" className="text-sm text-danger">{file.data.file} isn't valid JSON. Fix it in an editor; it's applied when saved.</p> }
  const { revision } = file.data
  return (
    <Editor key={revision ?? 'new'} initial={initial} note={file.data.file ?? 'saves to config/headers.json'} saving={save.isPending}
      onSave={rows => save.mutate({ content: serializeHeaders(rows), revision }, {
        onSuccess: () => toast.success('Viewer simulation saved and applied'),
        onError: err => toast.error(err instanceof ApiRequestError && err.status === 409 ? 'The file changed on disk meanwhile; it has been reloaded' : errorMessage(err)),
      })} />
  )
}

/** 2.x setups have no project file: the simulation lasts for this session (like --headers). */
function SessionSimulation() {
  const sim = useViewerSimulation(true)
  const save = useSaveViewerSimulation()
  if (sim.isLoading) return <Spinner />
  if (sim.error || !sim.data) return <p role="alert" className="text-sm text-danger">{errorMessage(sim.error)}</p>
  const initial: HeaderRow[] = [
    ...Object.entries(sim.data.requestHeaders).map(([key, value]) => ({ key, value, target: 'request' as const })),
    ...Object.entries(sim.data.responseHeaders).map(([key, value]) => ({ key, value, target: 'response' as const })),
  ]
  const pick = (rows: HeaderRow[], target: HeaderRow['target']) => Object.fromEntries(rows.filter(r => r.target === target && r.key.trim()).map(r => [r.key.trim(), r.value]))
  return (
    <Editor key={JSON.stringify(sim.data)} initial={initial} note="this session only" saving={save.isPending}
      onSave={rows => save.mutate({ requestHeaders: pick(rows, 'request'), responseHeaders: pick(rows, 'response') }, {
        onSuccess: () => toast.success('Viewer simulation applied'),
        onError: err => toast.error(errorMessage(err)),
      })} />
  )
}

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']

/** Sends a request through the distribution as a viewer would; its journey appears in Traffic. */
function TestRequest() {
  const [method, setMethod] = useState('GET')
  const [path, setPath] = useState('/')
  const [headerText, setHeaderText] = useState('')
  const [body, setBody] = useState('')
  const invoke = useInvoke()
  const showJourney = useTrafficUI(s => s.select)
  const parsed = parseHeaderLines(headerText)
  const hasBody = !['GET', 'HEAD'].includes(method)
  const result = invoke.data

  const send = () => invoke.mutate({ method, path: path.startsWith('/') ? path : `/${path}`, headers: parsed.headers, ...(hasBody && body ? { body } : {}) }, {
    onSuccess: r => showJourney(r.requestId),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); send() }} className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        <select aria-label="Method" value={method} onChange={e => setMethod(e.target.value)} className="h-8 rounded border border-line bg-bg px-1 font-mono text-xs">
          {METHODS.map(m => <option key={m}>{m}</option>)}
        </select>
        <input aria-label="Path" value={path} onChange={e => setPath(e.target.value)} className="h-8 min-w-0 flex-1 rounded border border-line bg-bg px-2 font-mono text-xs" placeholder="/index.html?x=1" />
        <Button type="submit" size="sm" variant="primary" disabled={invoke.isPending || !!parsed.error}><Send size={13} /> {invoke.isPending ? 'Sending…' : 'Send'}</Button>
      </div>
      <textarea aria-label="Request headers" value={headerText} onChange={e => setHeaderText(e.target.value)} rows={2}
        placeholder={'Headers, one per line: Authorization: Basic …'} className="rounded border border-line bg-bg p-2 font-mono text-xs" />
      {parsed.error && <p role="alert" className="text-xs text-danger">{parsed.error}</p>}
      {hasBody && <textarea aria-label="Request body" value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder="Body" className="rounded border border-line bg-bg p-2 font-mono text-xs" />}
      <p className="text-xs text-muted">The simulated headers above are added, as for any request.</p>
      {invoke.error && <p role="alert" className="text-xs text-danger">{errorMessage(invoke.error)}</p>}
      {result && (
        <div role="status" className="rounded-md border border-line p-2 text-xs">
          <div className="mb-1 flex items-center gap-2">
            <span className={cn('font-mono text-sm font-semibold', statusTone(result.status))}>{result.status}</span>
            <span className="text-muted">{result.durationMs} ms · {result.bodySize.toLocaleString()} bytes</span>
            <button type="button" onClick={() => showJourney(result.requestId)} className="ml-auto text-accent hover:underline">Show journey</button>
          </div>
          {result.bodyEncoding === 'text' && result.body
            ? <pre className="max-h-32 overflow-auto font-mono whitespace-pre-wrap break-all">{result.body}{result.bodyTruncated ? '\n…' : ''}</pre>
            : <p className="text-muted">{result.bodySize ? 'Binary body' : 'No body'}</p>}
        </div>
      )}
    </form>
  )
}

/** The viewer: the headers CloudFront and the viewer would send with every request, and test requests. */
export function ViewerInspector({ editable }: { editable: boolean }) {
  return (
    <Panel title="Viewer" subtitle="What every request looks like when it reaches CloudFront">
      <Section title="Test request"><TestRequest /></Section>
      <p className="mb-4 flex gap-2 rounded-md bg-surface-2 p-2.5 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>Headers <em>CloudFront adds</em> (location, device…) follow AWS: Lambda@Edge viewer functions don't see them, origin functions and CloudFront Functions do. A value CloudFront adds overrides one the client sends.</span>
      </p>
      {editable ? <FileSimulation /> : <SessionSimulation />}
    </Panel>
  )
}
