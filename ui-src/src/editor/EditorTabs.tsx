import { useState } from 'react'
import { Braces, FileCode2, KeyRound, LayoutGrid, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { cn } from '@/lib/cn'
import { isDirty, useEditor, type EditorTab } from './store'

const icon = (tab: EditorTab) =>
  tab.kind === 'function' ? <FileCode2 size={13} aria-hidden /> : tab.kind === 'kvs' ? <KeyRound size={13} aria-hidden /> : <Braces size={13} aria-hidden />
const title = (tab: EditorTab) => (tab.kind === 'manifest' ? 'cloudfrontize.json' : tab.id)

/** The schematic and the open files, as tabs. Closing a file with unsaved changes asks first. */
export function EditorTabs() {
  const { tabs, active, buffers, activate, close } = useEditor()
  const [confirm, setConfirm] = useState<EditorTab | null>(null)
  const request = (tab: EditorTab) => (isDirty(buffers[tab.key]) ? setConfirm(tab) : close(tab.key))

  return (
    <div role="tablist" aria-label="Open views" className="flex shrink-0 items-end gap-0.5 overflow-x-auto border-b border-line bg-bg px-2 pt-1.5">
      <button type="button" role="tab" aria-selected={active === null} onClick={() => activate(null)}
        className={cn('flex items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-1.5 text-xs', active === null ? 'border-line bg-surface text-text' : 'border-transparent text-muted hover:text-text')}>
        <LayoutGrid size={13} aria-hidden /> Schematic
      </button>
      {tabs.map(tab => {
        const selected = active === tab.key
        const dirty = isDirty(buffers[tab.key])
        return (
          <div key={tab.key} className={cn('flex items-center rounded-t-md border border-b-0 text-xs', selected ? 'border-line bg-surface text-text' : 'border-transparent text-muted hover:text-text')}>
            <button type="button" role="tab" aria-selected={selected} onClick={() => activate(tab.key)}
              onAuxClick={e => { if (e.button === 1) request(tab) }}
              className="flex items-center gap-1.5 py-1.5 pl-3 pr-1 font-mono">
              {icon(tab)} {title(tab)}
              {dirty && <span className="size-1.5 rounded-full bg-accent" aria-label="unsaved changes" />}
            </button>
            <button type="button" aria-label={`Close ${title(tab)}`} onClick={() => request(tab)} className="mr-1 rounded p-0.5 hover:bg-surface-2">
              <X size={12} />
            </button>
          </div>
        )
      })}

      <Dialog open={!!confirm} onOpenChange={o => { if (!o) setConfirm(null) }} title={`Close ${confirm ? title(confirm) : ''}?`}
        description="It has unsaved changes, which will be lost."
        footer={<>
          <Button variant="ghost" onClick={() => setConfirm(null)}>Keep editing</Button>
          <Button variant="danger" onClick={() => { if (confirm) close(confirm.key); setConfirm(null) }}>Discard changes</Button>
        </>}>
        <p className="text-sm text-muted">Save first to keep them.</p>
      </Dialog>
    </div>
  )
}
