import { useState } from 'react'
import { ArrowRight, FolderOpen, FolderX, Plus, X } from 'lucide-react'
import type { RecentProject } from '@contract'
import { errorMessage } from '@/api/client'
import { useForgetRecent, useOpenProject, useRecentProjects, useServerInfo } from '@/api/queries'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/Logo'
import { Spinner } from '@/components/ui/Spinner'
import { useUI } from '@/state/ui'
import { NewProjectDialog } from './NewProjectDialog'
import { OpenProjectDialog } from './OpenProjectDialog'

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
function ago(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000)
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour')
  return relative.format(Math.round(hours / 24), 'day')
}

function RecentRow({ project, onOpen }: { project: RecentProject; onOpen(dir: string): void }) {
  const forget = useForgetRecent()
  return (
    <li className="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-2">
      <button type="button" disabled={!project.exists} onClick={() => onOpen(project.dir)} aria-label={`Open ${project.name}`} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed">
        {project.exists ? <FolderOpen size={16} className="shrink-0 text-accent" aria-hidden /> : <FolderX size={16} className="shrink-0 text-muted" aria-hidden />}
        <span className="min-w-0">
          <span className="block truncate font-medium">{project.name}</span>
          <span className="block truncate font-mono text-xs text-muted">{project.dir}</span>
        </span>
      </button>
      <span className="shrink-0 text-xs text-muted">{project.exists ? ago(project.openedAt) : 'moved or deleted'}</span>
      <button type="button" aria-label={`Remove ${project.name} from recent projects`} onClick={() => forget.mutate(project.dir)}
        className="rounded p-1 text-muted opacity-0 hover:bg-surface hover:text-text focus:opacity-100 group-hover:opacity-100">
        <X size={14} />
      </button>
    </li>
  )
}

/** The start screen: recent projects, Open, New. */
export function StartScreen() {
  const server = useServerInfo()
  const recent = useRecentProjects()
  const openProject = useOpenProject()
  const showWorkbench = useUI(s => s.showWorkbench)
  const [dialog, setDialog] = useState<'open' | 'new' | null>(null)
  const current = server.data?.project

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center gap-3">
        <Logo size={36} />
        <div>
          <h1 className="text-2xl font-semibold">CloudFrontize</h1>
          <p className="text-sm text-muted">A local CloudFront workbench{server.data ? ` · ${server.data.version}` : ''}</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => setDialog('new')}><Plus size={16} /> New project</Button>
        <Button onClick={() => setDialog('open')}><FolderOpen size={16} /> Open project…</Button>
        {current && <Button variant="ghost" onClick={showWorkbench}>Back to {current.name} <ArrowRight size={16} /></Button>}
      </div>

      <section aria-labelledby="recent-title" className="rounded-lg border border-line bg-surface">
        <h2 id="recent-title" className="border-b border-line px-4 py-3 text-sm font-semibold">Recent projects</h2>
        <div className="p-2">
          {recent.isLoading && <div className="p-3"><Spinner /></div>}
          {recent.data?.length === 0 && <p className="p-3 text-sm text-muted">Projects you open appear here.</p>}
          {recent.data && recent.data.length > 0 && (
            <ul>{recent.data.map(p => <RecentRow key={p.dir} project={p} onOpen={dir => openProject.mutate(dir, { onSuccess: showWorkbench })} />)}</ul>
          )}
          {openProject.error && <p role="alert" className="p-3 text-sm text-danger">{errorMessage(openProject.error)}</p>}
        </div>
      </section>

      <OpenProjectDialog open={dialog === 'open'} onOpenChange={o => setDialog(o ? 'open' : null)} onOpened={showWorkbench} />
      <NewProjectDialog open={dialog === 'new'} onOpenChange={o => setDialog(o ? 'new' : null)} onCreated={showWorkbench} />
    </main>
  )
}
