import * as ContextMenu from '@radix-ui/react-context-menu'
import * as Menu from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import type { MenuAction } from './functionActions'

const item = 'flex cursor-default select-none items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2'
const content = 'z-50 min-w-56 rounded-md border border-line bg-surface p-1 shadow-lg'

/** The same actions as a right-click menu... */
export function FunctionContextMenu({ actions, children }: { actions: MenuAction[]; children: ReactNode }) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={content}>
          {actions.map(a => [
            a.separatorBefore && <ContextMenu.Separator key={`${a.label}-sep`} className="my-1 h-px bg-line" />,
            <ContextMenu.Item key={a.label} className={`${item} ${a.danger ? 'text-danger' : ''}`} onSelect={a.onSelect}>{a.icon}{a.label}</ContextMenu.Item>,
          ])}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

/** ...and as a button menu, for keyboard and touch. */
export function FunctionDropdown({ actions, trigger, label }: { actions: MenuAction[]; trigger: ReactNode; label: string }) {
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={label} className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-text">{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className={content} align="end" sideOffset={4}>
          {actions.map(a => [
            a.separatorBefore && <Menu.Separator key={`${a.label}-sep`} className="my-1 h-px bg-line" />,
            <Menu.Item key={a.label} className={`${item} ${a.danger ? 'text-danger' : ''}`} onSelect={a.onSelect}>{a.icon}{a.label}</Menu.Item>,
          ])}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
