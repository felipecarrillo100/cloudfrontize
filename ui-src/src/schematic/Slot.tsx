import * as Menu from '@radix-ui/react-dropdown-menu'
import { AlertCircle, CheckCircle2, ChevronRight, MoreHorizontal, Plus } from 'lucide-react'
import type { DistributionBehavior, DistributionFunction, EdgeEvent, FunctionType } from '@contract'
import { reportEditError, useAttachFunction } from '@/api/mutations'
import { cn } from '@/lib/cn'
import { useDialogs } from '@/state/dialogs'
import { useUI } from '@/state/ui'
import { useEditor } from '@/editor/store'
import { FunctionContextMenu, FunctionDropdown } from './FunctionMenu'
import { useFunctionActions } from './functionActions'
import { slotOptions, typeName } from './rules'

interface SlotProps {
  behavior: DistributionBehavior
  event: EdgeEvent
  functions: DistributionFunction[]
  editable: boolean
}

const kindTone = (type: FunctionType) => (type === 'cloudfront-function' ? 'border-cff text-cff' : 'border-lae text-lae')
const kindShort = (type: FunctionType) => (type === 'cloudfront-function' ? 'CFF' : 'L@E')

function FilledSlot({ fn, behavior, event, editable }: { fn: DistributionFunction; behavior: DistributionBehavior; event: EdgeEvent; editable: boolean }) {
  const actions = useFunctionActions(fn, { behavior: behavior.key, event }, editable)
  const { selection, select } = useUI()
  const selected = selection?.kind === 'function' && selection.id === fn.id
  const failed = fn.build.status === 'error' || fn.build.status === 'missing'
  return (
    <FunctionContextMenu actions={actions}>
      <div className={cn('flex w-full items-center gap-1.5 rounded-md border bg-surface px-2 py-1.5 shadow-sm', selected ? 'border-accent ring-1 ring-accent' : 'border-line', fn.disabled && 'opacity-60')}>
        <button type="button" onClick={() => select({ kind: 'function', id: fn.id })} onDoubleClick={() => editable && useEditor.getState().open('function', fn.id)}
          title={editable ? 'Double-click to edit the code' : undefined} className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-label={`${typeName[fn.type]} ${fn.id} on ${event}${fn.disabled ? ', disabled' : ''}${failed ? ', build error' : ''}`}>
          <span className={cn('rounded border px-1 font-mono text-[10px] leading-4', kindTone(fn.type))}>{kindShort(fn.type)}</span>
          <span className={cn('truncate text-sm font-medium', fn.disabled && 'line-through')}>{fn.id}</span>
          {failed ? <AlertCircle size={14} className="ml-auto shrink-0 text-danger" aria-hidden /> : <CheckCircle2 size={14} className="ml-auto shrink-0 text-ok" aria-hidden />}
        </button>
        <FunctionDropdown actions={actions} label={`Actions for ${fn.id}`} trigger={<MoreHorizontal size={14} />} />
      </div>
    </FunctionContextMenu>
  )
}

const menuItem = 'flex cursor-default select-none items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50'

function EmptySlot({ behavior, event, functions }: { behavior: DistributionBehavior; event: EdgeEvent; functions: DistributionFunction[] }) {
  const options = slotOptions(behavior, event, functions)
  const openDialog = useDialogs(s => s.open)
  const attach = useAttachFunction()
  const newOf = (type: FunctionType) => () => openDialog('newFunction', { type, event, behavior: behavior.key })
  return (
    <Menu.Root>
      <Menu.Trigger className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line bg-bg/60 px-2 py-1.5 text-xs text-muted hover:border-accent hover:text-accent">
        <Plus size={14} aria-hidden /> Add function <span className="sr-only">to {event}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content sideOffset={4} className="z-50 w-72 rounded-md border border-line bg-surface p-1 shadow-lg">
          {(['cloudfront-function', 'lambda-edge'] as FunctionType[]).map(type => (
            <Menu.Item key={type} disabled={!options.types[type].allowed} onSelect={newOf(type)} className={cn(menuItem, 'flex-col items-start gap-0.5')}>
              <span>New {typeName[type]}…</span>
              {options.types[type].reason && <span className="text-xs text-muted">{options.types[type].reason}</span>}
            </Menu.Item>
          ))}
          {options.existing.length > 0 && (
            <>
              <Menu.Separator className="my-1 h-px bg-line" />
              <Menu.Sub>
                <Menu.SubTrigger className={menuItem}>Use an existing function <ChevronRight size={14} className="ml-auto" aria-hidden /></Menu.SubTrigger>
                <Menu.Portal>
                  <Menu.SubContent className="z-50 max-h-80 w-64 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-lg">
                    {options.existing.map(({ fn, allowed, reason }) => (
                      <Menu.Item key={fn.id} disabled={!allowed} title={reason} className={menuItem}
                        onSelect={() => attach.mutate({ behavior: behavior.key, event, id: fn.id }, { onError: reportEditError })}>
                        <span className={cn('rounded border px-1 font-mono text-[10px] leading-4', kindTone(fn.type))}>{kindShort(fn.type)}</span>
                        <span className="truncate">{fn.id}</span>
                      </Menu.Item>
                    ))}
                  </Menu.SubContent>
                </Menu.Portal>
              </Menu.Sub>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** One of a behavior's four event slots: its function, or a menu offering only what AWS allows there. */
export function Slot({ behavior, event, functions, editable }: SlotProps) {
  const fn = functions.find(f => f.id === behavior.functions[event])
  if (fn) return <FilledSlot fn={fn} behavior={behavior} event={event} editable={editable} />
  if (!editable) return <div className="w-full rounded-md border border-dashed border-line px-2 py-1.5 text-center text-xs text-muted">No function</div>
  return <EmptySlot behavior={behavior} event={event} functions={functions} />
}
