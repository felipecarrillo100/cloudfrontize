import { useState } from 'react'
import { useFolder, useOpenProject } from '@/api/queries'
import { ApiRequestError, errorMessage } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { FolderBrowser } from '@/components/FolderBrowser'
import { DiagnosticsList } from '@/components/DiagnosticsList'

interface Props {
  open: boolean
  onOpenChange(open: boolean): void
  onOpened(): void
}

/** Choose a project folder (one with a cloudfrontize.json) and open it. */
export function OpenProjectDialog({ open, onOpenChange, onOpened }: Props) {
  const [path, setPath] = useState<string | null>(null)
  const listing = useFolder(path, false, open)
  const openProject = useOpenProject()
  const current = listing.data

  const submit = (target: string) => openProject.mutate(target, {
    onSuccess: () => { onOpenChange(false); onOpened() },
  })

  const failure = openProject.error
  return (
    <Dialog
      open={open}
      onOpenChange={o => { if (!o) openProject.reset(); onOpenChange(o) }}
      title="Open project"
      description="Choose a folder with a cloudfrontize.json."
      className="max-w-2xl"
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" disabled={!current?.isProject || openProject.isPending} onClick={() => current && submit(current.path)}>
          {openProject.isPending ? 'Opening…' : 'Open'}
        </Button>
      </>}
    >
      <FolderBrowser path={path} onNavigate={p => { openProject.reset(); setPath(p) }} onChooseProject={submit} />
      {current && !current.isProject && <p className="mt-3 text-xs text-muted">This folder isn't a project. Projects are marked in the list.</p>}
      {failure && (
        <div role="alert" className="mt-3 rounded-md border border-danger/40 p-3">
          <p className="mb-2 text-sm font-medium text-danger">{errorMessage(failure)}</p>
          {failure instanceof ApiRequestError && <DiagnosticsList diagnostics={failure.diagnostics} />}
        </div>
      )}
    </Dialog>
  )
}
