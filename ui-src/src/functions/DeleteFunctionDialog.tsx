import { useState } from 'react'
import type { DistributionFunction } from '@contract'
import { useDeleteFunction } from '@/api/mutations'
import { errorMessage } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useUI } from '@/state/ui'

/** Removes a function from the project (detaching it everywhere), and optionally deletes its file. */
export function DeleteFunctionDialog({ fn, onClose }: { fn: DistributionFunction | null; onClose(): void }) {
  const remove = useDeleteFunction()
  const select = useUI(s => s.select)
  const [deleteFile, setDeleteFile] = useState(false)
  const close = () => { setDeleteFile(false); remove.reset(); onClose() }
  return (
    <Dialog open={!!fn} onOpenChange={o => { if (!o) close() }} title={`Delete ${fn?.id ?? ''}?`}
      description="It's removed from the project and from every behavior that uses it."
      footer={<>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="danger" disabled={remove.isPending} onClick={() => fn && remove.mutate({ id: fn.id, deleteFile }, {
          onSuccess: () => { select(null); close() },
        })}>{deleteFile ? 'Delete function and file' : 'Delete function'}</Button>
      </>}>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={deleteFile} onChange={e => setDeleteFile(e.target.checked)} />
        <span>Also delete <code className="font-mono">{fn?.file}</code> from disk</span>
      </label>
      {remove.error && <p role="alert" className="mt-3 text-sm text-danger">{errorMessage(remove.error)}</p>}
    </Dialog>
  )
}
