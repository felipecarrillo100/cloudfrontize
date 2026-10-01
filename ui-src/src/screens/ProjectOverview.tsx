import { MoreHorizontal } from 'lucide-react'
import type { Distribution, DistributionFunction } from '@contract'
import { useProject } from '@/api/queries'
import { Badge } from '@/components/ui/Badge'
import { DiagnosticsList } from '@/components/DiagnosticsList'
import { FunctionContextMenu, FunctionDropdown } from '@/schematic/FunctionMenu'
import { useFunctionActions } from '@/schematic/functionActions'
import { Schematic } from '@/schematic/Schematic'
import { cn } from '@/lib/cn'
import { useUI } from '@/state/ui'

function BuildBadge({ fn }: { fn: DistributionFunction }) {
  switch (fn.build.status) {
    case 'ok': return <Badge tone="ok">built</Badge>
    case 'error': return <Badge tone="danger" title={fn.build.error?.message}>build error{fn.build.error?.line ? ` · line ${fn.build.error.line}` : ''}</Badge>
    case 'missing': return <Badge tone="danger">file missing</Badge>
    default: return <Badge>not attached</Badge>
  }
}

function FunctionRow({ fn, editable }: { fn: DistributionFunction; editable: boolean }) {
  const actions = useFunctionActions(fn, null, editable)
  const { selection, select } = useUI()
  const selected = selection?.kind === 'function' && selection.id === fn.id
  return (
    <FunctionContextMenu actions={actions}>
      <li className={cn('flex items-center gap-2 rounded-md px-2 py-1.5', selected ? 'bg-surface-2' : 'hover:bg-surface-2')}>
        <button type="button" onClick={() => select({ kind: 'function', id: fn.id })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Badge tone={fn.type === 'cloudfront-function' ? 'cff' : 'lae'}>{fn.type === 'cloudfront-function' ? 'CFF' : 'L@E'}</Badge>
          <span className={cn('font-medium', fn.disabled && 'line-through opacity-60')}>{fn.id}</span>
          <span className="hidden truncate font-mono text-xs text-muted lg:inline">{fn.file ?? fn.path}</span>
        </button>
        <BuildBadge fn={fn} />
        <FunctionDropdown actions={actions} label={`Actions for ${fn.id}`} trigger={<MoreHorizontal size={14} />} />
      </li>
    </FunctionContextMenu>
  )
}

/** The schematic, every function of the project (attached or not), and the project's checks. */
export function ProjectOverview({ dist, editable }: { dist: Distribution; editable: boolean }) {
  const project = useProject(editable)
  return (
    <div className="flex flex-col gap-4 p-4">
      <Schematic dist={dist} editable={editable} />

      <section aria-labelledby="functions-title" className="rounded-lg border border-line bg-surface p-3">
        <h2 id="functions-title" className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Functions</h2>
        {dist.functions.length === 0 && <p className="px-1 text-sm text-muted">No functions yet. Use "Add function" on a slot.</p>}
        <ul className="flex flex-col">{dist.functions.map(fn => <FunctionRow key={fn.id} fn={fn} editable={editable} />)}</ul>
      </section>

      {project.data && (
        <section aria-labelledby="checks-title" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="checks-title" className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Checks</h2>
          <DiagnosticsList diagnostics={project.data.diagnostics} empty="The project follows every AWS rule CloudFrontize checks." />
        </section>
      )}
    </div>
  )
}
