import { useEffect, useMemo, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { AlertCircle, Copy, Repeat, X } from 'lucide-react'
import { toast } from 'sonner'
import type { InvokeResult } from '@contract'
import { api, errorMessage } from '@/api/client'
import { useRequestDetail, useServerInfo } from '@/api/queries'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useLive } from '@/live/store'
import type { Journey } from '@/live/traffic'
import { cn } from '@/lib/cn'
import { useUI } from '@/state/ui'
import { curlOf, decodeBody, diffHeaders, previousOf, statusTone, stepsOf, type HeaderChange, type Step } from './journey'
import { useTrafficUI } from './store'

const changeStyle: Record<HeaderChange['kind'], string> = {
  added: 'text-ok', changed: 'text-warn', removed: 'text-danger line-through', same: 'text-text',
}
const changeMark: Record<HeaderChange['kind'], string> = { added: '+', changed: '~', removed: '−', same: ' ' }
const changeLabel: Record<HeaderChange['kind'], string> = { added: 'added', changed: 'changed', removed: 'removed', same: '' }

function HeadersView({ step, previous }: { step: Step; previous?: Step }) {
  const [onlyChanges, setOnlyChanges] = useState(false)
  const changes = diffHeaders(previous?.headers, step.headers)
  const changed = changes.filter(c => c.kind !== 'same').length
  const shown = onlyChanges ? changes.filter(c => c.kind !== 'same') : changes
  if (!step.headers) return <p className="text-sm text-muted">No header snapshot for this step.</p>
  return (
    <div>
      {previous && (
        <div className="mb-2 flex items-center gap-3 text-xs text-muted">
          <span>{changed ? `${changed} ${changed === 1 ? 'change' : 'changes'} since “${previous.label}”` : `No changes since “${previous.label}”`}</span>
          {changed > 0 && <label className="flex items-center gap-1"><input type="checkbox" checked={onlyChanges} onChange={e => setOnlyChanges(e.target.checked)} /> Only changes</label>}
        </div>
      )}
      <table className="w-full font-mono text-xs">
        <caption className="sr-only">Headers after {step.label}</caption>
        <tbody>
          {shown.map(c => (
            <tr key={c.name + c.kind} className={changeStyle[c.kind]}>
              <td className="w-4 py-0.5 align-top" aria-label={changeLabel[c.kind]}>{changeMark[c.kind]}</td>
              <td className="py-0.5 pr-3 align-top font-semibold whitespace-nowrap">{c.name}</td>
              <td className="py-0.5 break-all">
                {c.kind === 'changed' ? <><span className="text-muted line-through">{c.before}</span> {c.after}</> : (c.after ?? c.before)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BodyView({ step }: { step: Step }) {
  if (step.bodyUnchanged) return <p className="text-sm text-muted">Unchanged from the previous step.</p>
  if (!step.body && !step.bodySize) return <p className="text-sm text-muted">No body.</p>
  const text = decodeBody(step.body, step.contentType, step.bodyTruncated)
  const size = step.bodySize != null ? `${step.bodySize.toLocaleString()} bytes` : ''
  return (
    <div>
      <p className="mb-2 text-xs text-muted">{[step.contentType?.split(';')[0], size, step.bodyTruncated && 'snapshot truncated'].filter(Boolean).join(' · ')}</p>
      {text !== null
        ? <pre className="max-h-64 overflow-auto rounded border border-line bg-bg p-2 font-mono text-xs whitespace-pre-wrap break-all">{text}</pre>
        : <p className="text-sm text-muted">{step.bodyTruncated ? 'Too large to show in full.' : 'Binary content.'}</p>}
    </div>
  )
}

const stepDot: Record<Step['kind'], string> = {
  viewer: 'bg-request', function: 'bg-accent', 'short-circuit': 'bg-warn', origin: 'bg-response', response: 'bg-ok',
}

/** One request: its journey step by step, what each step changed, and what the viewer got. */
export function RequestDetail({ journey }: { journey: Journey }) {
  const detail = useRequestDetail(journey.id, journey.partial)
  const hydrate = useLive(s => s.hydrateRequest)
  const server = useServerInfo()
  const close = useTrafficUI(s => s.select)
  const selectInInspector = useUI(s => s.select)
  const steps = useMemo(() => stepsOf(journey), [journey])
  const [active, setActive] = useState<number | null>(null)
  const index = active !== null && active < steps.length ? active : steps.length - 1
  const step = steps[index]

  useEffect(() => { if (detail.data) hydrate(journey.id, detail.data.events) }, [detail.data, hydrate, journey.id])

  const copyCurl = () => {
    if (!server.data) return
    void navigator.clipboard.writeText(curlOf(journey, server.data.ports.main)).then(() => toast.success('Copied as cURL'))
  }
  const resend = async () => {
    const headers = Object.fromEntries(Object.entries(journey.requestHeaders ?? {})
      .filter(([k]) => !['host', 'content-length', 'connection'].includes(k.toLowerCase()))
      .map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v]))
    try {
      const r = await api<InvokeResult>('POST', '/invoke', {
        method: journey.method, path: journey.url, headers,
        ...(journey.requestBody?.body ? { body: journey.requestBody.body, bodyEncoding: 'base64' } : {}),
      })
      useTrafficUI.getState().select(r.requestId)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <section aria-label={`Request ${journey.method ?? ''} ${journey.url ?? ''}`} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className={cn('font-mono text-sm font-semibold', statusTone(journey.status, !!journey.failure))}>{journey.status ?? '…'}</span>
        <span className="font-mono text-xs text-muted">{journey.method}</span>
        <span className="min-w-0 truncate font-mono text-sm">{journey.url}</span>
        {journey.durationMs != null && <span className="text-xs text-muted">{journey.durationMs} ms</span>}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={copyCurl} disabled={journey.partial}><Copy size={13} /> cURL</Button>
          <Button size="sm" variant="ghost" onClick={resend} disabled={journey.partial}><Repeat size={13} /> Resend</Button>
          <button type="button" aria-label="Close request details" onClick={() => close(null)} className="rounded p-1 text-muted hover:bg-surface-2"><X size={14} /></button>
        </div>
      </div>

      {journey.failure && (
        <p role="alert" className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm text-danger"><AlertCircle size={14} aria-hidden /> {journey.failure}</p>
      )}

      {journey.partial ? (
        <div className="p-4">{detail.error ? <p className="text-sm text-danger">{errorMessage(detail.error)}</p> : <Spinner label="Loading the journey" />}</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(180px,2fr)_3fr]">
          <ol aria-label="Journey" className="min-h-0 overflow-y-auto border-r border-line py-1">
            {steps.map((s, i) => (
              <li key={s.key}>
                <button type="button" onClick={() => setActive(i)} aria-current={i === index ? 'step' : undefined}
                  className={cn('flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs', i === index ? 'bg-surface-2' : 'hover:bg-surface-2')}>
                  <span className={cn('mt-1 size-2 shrink-0 rounded-full', stepDot[s.kind])} aria-hidden />
                  <span className="min-w-0">
                    <span className="block">{s.label}</span>
                    {(s.status !== undefined || (s.uri && s.uri !== journey.url)) && (
                      <span className="block font-mono text-muted">{[s.status, s.uri && s.uri !== journey.url ? `→ ${s.uri}` : ''].filter(Boolean).join(' ')}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <div className="min-h-0 overflow-y-auto p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{step.label}</h3>
              {step.functionIds.map(id => (
                <button key={id} type="button" onClick={() => selectInInspector({ kind: 'function', id })} title="Show in the inspector">
                  <Badge tone={step.runtime === 'cloudfront-function' ? 'cff' : 'lae'}>{id}</Badge>
                </button>
              ))}
            </div>
            <Tabs.Root defaultValue="headers">
              <Tabs.List aria-label="Snapshot" className="mb-2 flex gap-1">
                {['headers', 'body'].map(t => (
                  <Tabs.Trigger key={t} value={t} className="rounded border border-line px-2 py-0.5 text-xs capitalize text-muted data-[state=active]:border-accent data-[state=active]:text-accent">{t}</Tabs.Trigger>
                ))}
              </Tabs.List>
              <Tabs.Content value="headers"><HeadersView step={step} previous={previousOf(steps, index)} /></Tabs.Content>
              <Tabs.Content value="body"><BodyView step={step} /></Tabs.Content>
            </Tabs.Root>
          </div>
        </div>
      )}
    </section>
  )
}
