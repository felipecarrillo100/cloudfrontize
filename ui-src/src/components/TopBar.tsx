import * as Menu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Monitor, Moon, RefreshCw, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/api/client'
import { useReloadProject, useServerInfo } from '@/api/queries'
import { useLive } from '@/live/store'
import { useUI, type Theme } from '@/state/ui'
import { cn } from '@/lib/cn'
import { Logo } from './Logo'
import { useEditor } from '@/editor/store'

const connectionLabel = { open: 'Live', connecting: 'Connecting', reconnecting: 'Reconnecting' } as const

const menuItem = 'flex cursor-default select-none items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50'

export function TopBar({ onOpen, onNew }: { onOpen(): void; onNew(): void }) {
  const server = useServerInfo()
  const connection = useLive(s => s.connection)
  const reload = useReloadProject()
  const { theme, setTheme, showStart } = useUI()
  const project = server.data?.project

  const nextTheme: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <button type="button" onClick={showStart} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-2" aria-label="Start screen">
        <Logo size={22} />
      </button>

      <Menu.Root>
        <Menu.Trigger className="flex min-w-0 items-center gap-1.5 rounded px-2 py-1 text-sm font-semibold hover:bg-surface-2">
          <span className="truncate">{project ? project.name : '2.x command-line setup'}</span>
          <ChevronDown size={14} className="shrink-0 text-muted" aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="start" sideOffset={6} className="z-50 min-w-52 rounded-md border border-line bg-surface p-1 shadow-lg">
            <Menu.Item className={menuItem} onSelect={onNew}>New project…</Menu.Item>
            <Menu.Item className={menuItem} onSelect={onOpen}>Open project…</Menu.Item>
            <Menu.Item className={menuItem} onSelect={showStart}>Recent projects</Menu.Item>
            <Menu.Separator className="my-1 h-px bg-line" />
            <Menu.Item className={menuItem} disabled={!project} onSelect={() => useEditor.getState().open('manifest', 'manifest')}>Edit cloudfrontize.json</Menu.Item>
            <Menu.Item className={menuItem} disabled={!project} onSelect={() => reload.mutate(undefined, {
              onSuccess: () => toast.success('Project reloaded'),
              onError: err => toast.error(errorMessage(err)),
            })}>
              <RefreshCw size={14} aria-hidden /> Reload from disk
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

      {project && <span className="hidden truncate font-mono text-xs text-muted md:block" title={project.dir}>{project.dir}</span>}

      <div className="ml-auto flex items-center gap-3">
        {server.data && (
          <a className="font-mono text-xs text-muted hover:text-text" href={`http://localhost:${server.data.ports.main}/`} target="_blank" rel="noreferrer">
            localhost:{server.data.ports.main}
          </a>
        )}
        <span className="flex items-center gap-1.5 text-xs text-muted" role="status" aria-live="polite">
          <span className={cn('size-2 rounded-full', connection === 'open' ? 'bg-ok' : 'bg-warn animate-pulse')} aria-hidden />
          {connectionLabel[connection]}
        </span>
        <button type="button" onClick={() => setTheme(nextTheme[theme])} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-text"
          aria-label={`Theme: ${theme}. Switch to ${nextTheme[theme]}`} title={`Theme: ${theme}`}>
          <ThemeIcon size={16} />
        </button>
      </div>
    </header>
  )
}
