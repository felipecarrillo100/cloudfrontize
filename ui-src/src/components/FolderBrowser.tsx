import { useState } from 'react'
import { ChevronRight, Folder, FolderCheck, CornerLeftUp, Eye, EyeOff } from 'lucide-react'
import { useFolder } from '@/api/queries'
import { errorMessage } from '@/api/client'
import { crumbs } from '@/lib/paths'
import { cn } from '@/lib/cn'
import { Spinner } from './ui/Spinner'

interface FolderBrowserProps {
  /** The folder being shown (null: the first browse root). */
  path: string | null
  onNavigate(path: string): void
  /** Double-click (or Enter) on a project folder. */
  onChooseProject?(path: string): void
}

/**
 * Browses folders on this machine through the server, inside the folders it allows (home, the
 * start folder, the open project's folder). Projects are marked.
 */
export function FolderBrowser({ path, onNavigate, onChooseProject }: FolderBrowserProps) {
  const [hidden, setHidden] = useState(false)
  const { data, error, isLoading } = useFolder(path, hidden)

  if (isLoading && !data) return <div className="p-4"><Spinner label="Reading folders" /></div>
  if (error && !data) return <p role="alert" className="p-4 text-sm text-danger">{errorMessage(error)}</p>
  if (!data) return null

  const root = data.roots.find(r => data.path === r || data.path.startsWith(r)) ?? data.path
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {data.roots.map(r => (
          <button key={r} type="button" onClick={() => onNavigate(r)}
            className={cn('rounded border px-2 py-0.5 font-mono text-xs', r === root ? 'border-accent text-accent' : 'border-line text-muted hover:text-text')}>
            {r}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto rounded-md border border-line bg-bg px-2 py-1.5 text-sm">
        <button type="button" aria-label="Parent folder" disabled={!data.parent} onClick={() => data.parent && onNavigate(data.parent)}
          className="rounded p-1 text-muted hover:bg-surface-2 disabled:opacity-40">
          <CornerLeftUp size={14} />
        </button>
        <nav aria-label="Current folder" className="flex min-w-0 items-center gap-0.5">
          {crumbs(data.path, root).map((c, i, all) => (
            <span key={c.path} className="flex items-center gap-0.5 whitespace-nowrap">
              {i > 0 && <ChevronRight size={12} className="text-muted" aria-hidden />}
              <button type="button" onClick={() => onNavigate(c.path)} aria-current={i === all.length - 1 ? 'location' : undefined}
                className={cn('rounded px-1 hover:bg-surface-2', i === all.length - 1 ? 'font-medium text-text' : 'text-muted')}>
                {c.name}
              </button>
            </span>
          ))}
        </nav>
        <button type="button" onClick={() => setHidden(h => !h)} aria-pressed={hidden} title={hidden ? 'Hide hidden folders' : 'Show hidden folders'}
          className="ml-auto rounded p-1 text-muted hover:bg-surface-2">
          {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      <ul role="listbox" aria-label="Folders" className="h-64 overflow-y-auto rounded-md border border-line">
        {data.entries.length === 0 && <li className="p-4 text-sm text-muted">No folders here</li>}
        {data.entries.map(entry => (
          <li key={entry.path} role="option" aria-selected={false}>
            <button
              type="button"
              aria-label={entry.isProject ? `${entry.name} (project)` : entry.name}
              onClick={() => onNavigate(entry.path)}
              onDoubleClick={() => entry.isProject && onChooseProject?.(entry.path)}
              onKeyDown={e => { if (e.key === 'Enter' && entry.isProject && onChooseProject) { e.preventDefault(); onChooseProject(entry.path) } }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-2 focus:bg-surface-2"
            >
              {entry.isProject ? <FolderCheck size={15} className="text-accent" aria-hidden /> : <Folder size={15} className="text-muted" aria-hidden />}
              <span className={cn('truncate', entry.hidden && 'text-muted')}>{entry.name}</span>
              {entry.isProject && <span className="ml-auto text-xs text-accent" aria-hidden>project</span>}
            </button>
          </li>
        ))}
      </ul>
      {data.truncated && <p className="text-xs text-muted">Showing the first {data.entries.length} folders.</p>}
      {error && <p role="alert" className="text-xs text-danger">{errorMessage(error)}</p>}
    </div>
  )
}
