import { Power, PowerOff } from 'lucide-react'
import type { Distribution, DistributionFunction, EdgeEvent } from '@contract'
import { errorMessage } from '@/api/client'
import { useControl, useDistribution, useProject } from '@/api/queries'
import { Badge } from '@/components/ui/Badge'
import { DiagnosticsList } from '@/components/DiagnosticsList'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'

const EVENTS: EdgeEvent[] = ['viewer-request', 'origin-request', 'origin-response', 'viewer-response']

const kindLabel = (f: DistributionFunction) => (f.type === 'cloudfront-function' ? 'CFF' : 'L@E')

function BuildBadge({ fn }: { fn: DistributionFunction }) {
  switch (fn.build.status) {
    case 'ok': return <Badge tone="ok">built</Badge>
    case 'error': return <Badge tone="danger" title={fn.build.error?.message}>build error{fn.build.error?.line ? ` · line ${fn.build.error.line}` : ''}</Badge>
    case 'missing': return <Badge tone="danger">file missing</Badge>
    default: return <Badge>not attached</Badge>
  }
}

function Slots({ dist }: { dist: Distribution }) {
  const byId = Object.fromEntries(dist.functions.map(f => [f.id, f]))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Functions by cache behavior and event</caption>
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-2 pr-3 font-medium">Behavior</th>
            <th className="py-2 pr-3 font-medium">Origin</th>
            {EVENTS.map(e => <th key={e} className="py-2 pr-3 font-medium">{e}</th>)}
          </tr>
        </thead>
        <tbody>
          {dist.behaviors.map(b => (
            <tr key={b.key} className="border-t border-line">
              <td className="py-2 pr-3 font-mono text-xs">{b.pathPattern ?? 'Default (*)'}</td>
              <td className="py-2 pr-3 font-mono text-xs text-muted">{b.origin}</td>
              {EVENTS.map(e => {
                const fn = b.functions[e] ? byId[b.functions[e]!] : undefined
                return (
                  <td key={e} className="py-2 pr-3">
                    {fn ? <Badge tone={fn.type === 'cloudfront-function' ? 'cff' : 'lae'} className={cn(fn.disabled && 'line-through opacity-60')}>{kindLabel(fn)} {fn.id}</Badge>
                      : <span className="text-xs text-muted">—</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * What the project runs: behaviors with their four event slots, the functions with their build state,
 * and the manifest's diagnostics. (The 3.0 schematic replaces the table.)
 */
export function ProjectOverview({ hasProject }: { hasProject: boolean }) {
  const dist = useDistribution()
  const project = useProject(hasProject)
  const control = useControl()

  if (dist.isLoading) return <div className="p-6"><Spinner label="Loading the distribution" /></div>
  if (dist.error) return <p role="alert" className="p-6 text-danger">{errorMessage(dist.error)}</p>
  if (!dist.data) return null

  return (
    <div className="flex flex-col gap-4 p-4">
      <section aria-labelledby="slots-title" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="slots-title" className="mb-2 text-sm font-semibold">Cache behaviors</h2>
        <p className="mb-3 text-xs text-muted">Matched top to bottom on the viewer's path; the default behavior catches the rest.</p>
        <Slots dist={dist.data} />
      </section>

      <section aria-labelledby="functions-title" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="functions-title" className="mb-3 text-sm font-semibold">Functions</h2>
        {dist.data.functions.length === 0 && <p className="text-sm text-muted">No functions yet.</p>}
        <ul className="flex flex-col divide-y divide-line">
          {dist.data.functions.map(fn => (
            <li key={fn.id} className="flex flex-wrap items-center gap-3 py-2">
              <Badge tone={fn.type === 'cloudfront-function' ? 'cff' : 'lae'}>{kindLabel(fn)}</Badge>
              <span className="font-medium">{fn.id}</span>
              <span className="truncate font-mono text-xs text-muted">{fn.file ?? fn.path}</span>
              <span className="ml-auto flex items-center gap-2">
                <BuildBadge fn={fn} />
                <button type="button" onClick={() => control.mutate({ action: fn.disabled ? 'enable' : 'disable', function: fn.id })}
                  className={cn('flex items-center gap-1 rounded border px-2 py-0.5 text-xs', fn.disabled ? 'border-line text-muted' : 'border-ok/40 text-ok')}
                  aria-pressed={!fn.disabled} title={fn.disabled ? 'Disabled for testing: click to enable' : 'Enabled: click to disable for testing'}>
                  {fn.disabled ? <PowerOff size={12} aria-hidden /> : <Power size={12} aria-hidden />}
                  {fn.disabled ? 'Off' : 'On'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {project.data && (
        <section aria-labelledby="diag-title" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="diag-title" className="mb-3 text-sm font-semibold">Checks</h2>
          <DiagnosticsList diagnostics={project.data.diagnostics} empty="The project follows every AWS rule CloudFrontize checks." />
        </section>
      )}
    </div>
  )
}
