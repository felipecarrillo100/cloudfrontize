import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface DialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/** An accessible modal dialog (focus trap, Escape to close, labelled by its title). */
export function Dialog({ open, onOpenChange, title, description, children, footer, className }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-surface shadow-xl',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <RadixDialog.Title className="text-base font-semibold">{title}</RadixDialog.Title>
              {description
                ? <RadixDialog.Description className="mt-1 text-sm text-muted">{description}</RadixDialog.Description>
                : <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>}
            </div>
            <RadixDialog.Close className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close">
              <X size={16} />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
