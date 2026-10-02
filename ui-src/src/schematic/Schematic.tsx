import * as Tabs from '@radix-ui/react-tabs'
import { Globe, Monitor, Network, Plus, Server } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Distribution, DistributionBehavior, EdgeEvent } from '@contract'
import { cn } from '@/lib/cn'
import { useDialogs } from '@/state/dialogs'
import { useUI, type Selection } from '@/state/ui'
import { Slot } from './Slot'

const notes: Record<EdgeEvent, string> = {
  'viewer-request': 'Every request, before the cache',
  'origin-request': 'Cache misses, before the origin',
  'origin-response': 'Cache misses, after the origin',
  'viewer-response': 'Every response; not when the origin returns 400+',
}

function Node({ kind, title, subtitle, icon }: { kind: Selection['kind']; title: string; subtitle?: string; icon: ReactNode }) {
  const { selection, select } = useUI()
  const selected = selection?.kind === kind
  return (
    <button type="button" onClick={() => select({ kind } as Selection)} aria-pressed={selected}
      className={cn('row-span-2 flex h-full min-h-28 flex-col items-center justify-center gap-1.5 rounded-lg border-2 bg-surface px-3 py-4 text-center hover:border-accent',
        selected ? 'border-accent' : 'border-text/70')}>
      <span className="text-muted" aria-hidden>{icon}</span>
      <span className="text-sm font-semibold">{title}</span>
      {subtitle && <span className="max-w-full truncate font-mono text-[11px] text-muted">{subtitle}</span>}
    </button>
  )
}

/** A lane segment: an arrow along the lane, with the event slot on it. */
function Lane({ direction, event, children }: { direction: 'request' | 'response'; event: EdgeEvent; children: ReactNode }) {
  const color = direction === 'request' ? 'var(--request)' : 'var(--response)'
  return (
    <div className="relative flex flex-col items-center justify-center gap-1 px-2 py-3">
      <svg className="pointer-events-none absolute inset-x-0 top-1/2 h-3 w-full -translate-y-1/2" preserveAspectRatio="none" viewBox="0 0 100 12" aria-hidden>
        <line x1="0" y1="6" x2="100" y2="6" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeDasharray={direction === 'response' ? '4 3' : undefined} />
      </svg>
      <svg className={cn('pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2', direction === 'request' ? 'right-0' : 'left-0 rotate-180')} viewBox="0 0 12 12" aria-hidden>
        <path d="M0 0 L12 6 L0 12 z" fill={color} />
      </svg>
      <span className="relative z-10 rounded bg-bg px-1 font-mono text-[11px]" style={{ color }}>{direction === 'request' ? `${event} →` : `← ${event}`}</span>
      <div className="relative z-10 w-full max-w-56">{children}</div>
      <span className="relative z-10 rounded bg-bg px-1 text-center text-[10px] text-muted">{notes[event]}</span>
    </div>
  )
}

const label = (b: DistributionBehavior) => b.pathPattern ?? 'Default (*)'

/**
 * The distribution as AWS runs it: Viewer, Distribution and Origin, the request lane on top and the
 * response lane below, and each cache behavior's four event slots where CloudFront runs them.
 */
export function Schematic({ dist, editable }: { dist: Distribution; editable: boolean }) {
  const { behaviorKey, showBehavior } = useUI()
  const openDialog = useDialogs(s => s.open)
  const behavior = dist.behaviors.find(b => b.key === behaviorKey) ?? dist.behaviors[dist.behaviors.length - 1]
  const origin = dist.origins.find(o => o.id === behavior.origin)
  const viewerSummary = dist.mode === 'project' ? 'viewer simulation' : undefined

  return (
    <section aria-labelledby="schematic-title" className="flex flex-col gap-3">
      <h2 id="schematic-title" className="sr-only">Distribution schematic</h2>
      <Tabs.Root value={behavior.key} onValueChange={showBehavior}>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs.List aria-label="Cache behaviors (matched in this order)" className="flex flex-wrap gap-1">
            {dist.behaviors.map((b, i) => (
              <Tabs.Trigger key={b.key} value={b.key}
                className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 font-mono text-xs text-muted data-[state=active]:border-accent data-[state=active]:bg-surface data-[state=active]:text-text">
                {b.pathPattern !== null && <span className="text-[10px] text-muted">{i + 1}</span>}
                {label(b)}
                {Object.keys(b.functions).length > 0 && <span className="size-1.5 rounded-full bg-accent" aria-label="has functions" />}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {editable && (
            <button type="button" onClick={() => openDialog('behavior', { key: null })} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text">
              <Plus size={14} aria-hidden /> Add behavior
            </button>
          )}
        </div>
      </Tabs.Root>

      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-[120px_1fr_150px_1fr_130px] grid-rows-[auto_auto] items-stretch gap-x-0 gap-y-2 rounded-lg border border-line bg-surface-2/40 p-4">
          <Node kind="viewer" title="Viewer" subtitle={viewerSummary} icon={<Monitor size={20} />} />
          <Lane direction="request" event="viewer-request"><Slot behavior={behavior} event="viewer-request" functions={dist.functions} editable={editable} /></Lane>
          <Node kind="distribution" title="Distribution" subtitle={label(behavior)} icon={<Network size={20} />} />
          <Lane direction="request" event="origin-request"><Slot behavior={behavior} event="origin-request" functions={dist.functions} editable={editable} /></Lane>
          <Node kind="origin" title="Origin" subtitle={origin ? `${origin.id} · ${origin.type === 's3' ? origin.bucket : 'local'}` : behavior.origin}
            icon={origin?.type === 's3' ? <Globe size={20} /> : <Server size={20} />} />
          <Lane direction="response" event="viewer-response"><Slot behavior={behavior} event="viewer-response" functions={dist.functions} editable={editable} /></Lane>
          <Lane direction="response" event="origin-response"><Slot behavior={behavior} event="origin-response" functions={dist.functions} editable={editable} /></Lane>
        </div>
      </div>
    </section>
  )
}
