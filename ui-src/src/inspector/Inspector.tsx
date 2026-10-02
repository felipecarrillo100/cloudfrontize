import type { Distribution } from '@contract'
import { useUI } from '@/state/ui'
import { DistributionInspector } from './DistributionInspector'
import { FunctionInspector } from './FunctionInspector'
import { OriginInspector } from './OriginInspector'
import { ViewerInspector } from './ViewerInspector'

/** Shows the inspector for what's selected on the schematic. */
export function Inspector({ dist, editable }: { dist: Distribution; editable: boolean }) {
  const selection = useUI(s => s.selection)
  if (!selection) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
        Select the Viewer, the Distribution, the Origin or a function to see and change its settings.
        {editable && ' Right-click a function for its actions.'}
      </div>
    )
  }
  switch (selection.kind) {
    case 'viewer': return <ViewerInspector editable={editable} />
    case 'distribution': return <DistributionInspector dist={dist} editable={editable} />
    case 'origin': return <OriginInspector dist={dist} editable={editable} />
    case 'function': {
      const fn = dist.functions.find(f => f.id === selection.id)
      return fn ? <FunctionInspector key={fn.id} fn={fn} editable={editable} /> : <p className="p-6 text-sm text-muted">That function no longer exists.</p>
    }
  }
}
