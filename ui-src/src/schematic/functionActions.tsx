import { Code2, Crosshair, FilePen, ExternalLink, FileOutput, Pencil, Power, PowerOff, Trash2, Unplug } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DistributionFunction, EdgeEvent } from '@contract'
import { useControl } from '@/api/queries'
import { reportEditError, useDetachFunction, useOpenInEditor } from '@/api/mutations'
import { useDialogs } from '@/state/dialogs'
import { useUI } from '@/state/ui'
import { useEditor } from '@/editor/store'

export interface MenuAction {
  label: string
  icon: ReactNode
  onSelect(): void
  danger?: boolean
  separatorBefore?: boolean
}

/** The actions on a function in a slot. `editable` is false for 2.x setups (read-only). */
export function useFunctionActions(fn: DistributionFunction, slot: { behavior: string; event: EdgeEvent } | null, editable: boolean): MenuAction[] {
  const control = useControl()
  const detach = useDetachFunction()
  const openInEditor = useOpenInEditor()
  const dialogs = useDialogs()
  const select = useUI(s => s.select)

  const actions: MenuAction[] = [
    ...(editable ? [{ label: 'Edit code', icon: <FilePen size={14} />, onSelect: () => useEditor.getState().open('function', fn.id) }] : []),
    { label: 'Inspect', icon: <Code2 size={14} />, onSelect: () => select({ kind: 'function', id: fn.id }) },
    { label: 'Open in VS Code', icon: <ExternalLink size={14} />, onSelect: () => openInEditor.mutate(fn.id) },
    { label: 'View production build', icon: <FileOutput size={14} />, onSelect: () => dialogs.open('production', fn.id) },
    {
      label: fn.disabled ? 'Enable' : 'Disable for testing', icon: fn.disabled ? <Power size={14} /> : <PowerOff size={14} />, separatorBefore: true,
      onSelect: () => control.mutate({ action: fn.disabled ? 'enable' : 'disable', function: fn.id }),
    },
    { label: 'Isolate (disable all others)', icon: <Crosshair size={14} />, onSelect: () => control.mutate({ action: 'isolate', function: fn.id }) },
  ]
  if (editable) {
    actions.push({ label: 'Rename…', icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => dialogs.open('rename', fn.id) })
    if (slot) actions.push({ label: 'Remove from this slot', icon: <Unplug size={14} />, onSelect: () => detach.mutate(slot, { onError: reportEditError }) })
    actions.push({ label: 'Delete function…', icon: <Trash2 size={14} />, danger: true, onSelect: () => dialogs.open('remove', fn) })
  }
  return actions
}

