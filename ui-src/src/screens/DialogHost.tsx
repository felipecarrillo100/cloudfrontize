import type { Distribution } from '@contract'
import { DeleteFunctionDialog } from '@/functions/DeleteFunctionDialog'
import { NewFunctionDialog } from '@/functions/NewFunctionDialog'
import { ProductionCodeDialog } from '@/functions/ProductionCodeDialog'
import { RenameFunctionDialog } from '@/functions/RenameFunctionDialog'
import { BehaviorDialog } from '@/inspector/BehaviorDialog'
import { useDialogs } from '@/state/dialogs'

/** Renders the workbench's dialogs (opened from menus through the dialog store). */
export function DialogHost({ dist }: { dist: Distribution }) {
  const d = useDialogs()
  const ids = dist.functions.map(f => f.id)
  return (
    <>
      <NewFunctionDialog target={d.newFunction} takenIds={ids} onClose={() => d.close('newFunction')} />
      <RenameFunctionDialog id={d.rename} takenIds={ids} onClose={() => d.close('rename')} />
      <DeleteFunctionDialog fn={d.remove} onClose={() => d.close('remove')} />
      <ProductionCodeDialog id={d.production} onClose={() => d.close('production')} />
      <BehaviorDialog dist={dist} target={d.behavior} onClose={() => d.close('behavior')} />
    </>
  )
}
