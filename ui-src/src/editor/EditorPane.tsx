import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, ExternalLink, FileOutput, GitCompare, Info, RotateCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/api/client'
import { useOpenInEditor } from '@/api/mutations'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { useDialogs } from '@/state/dialogs'
import { useUI } from '@/state/ui'
import { CodeEditor, DiffView } from './CodeEditor'
import type { Problem } from './problems'
import { isDirty, useEditor, type EditorTab } from './store'
import { useFileSource } from './useFileSource'

const useDark = () => {
  const theme = useUI(s => s.theme)
  return theme === 'dark' || (theme === 'system' && document.documentElement.dataset.theme === 'dark')
}

function SizeMeter({ bytes, limit }: { bytes: number; limit: number }) {
  const over = bytes > limit
  return (
    <span className={cn('flex items-center gap-1.5', over ? 'text-danger' : bytes > limit * 0.8 ? 'text-warn' : 'text-muted')}
      title="CloudFront Functions are limited to 10 KB (not adjustable)">
      <span className="h-1.5 w-16 overflow-hidden rounded bg-surface-2" aria-hidden>
        <span className={cn('block h-full', over ? 'bg-danger' : 'bg-ok')} style={{ width: `${Math.min(bytes / limit, 1) * 100}%` }} />
      </span>
      {(bytes / 1024).toFixed(1)} / 10 KB
    </span>
  )
}

const problemIcon = {
  error: <AlertCircle size={13} className="shrink-0 text-danger" aria-label="Error" />,
  warning: <AlertTriangle size={13} className="shrink-0 text-warn" aria-label="Warning" />,
  info: <Info size={13} className="shrink-0 text-muted" aria-label="Info" />,
}

/** One open file: the editor, its problems, saving with conflict detection, and its status. */
export function EditorPane({ tab }: { tab: EditorTab }) {
  const source = useFileSource(tab)
  const buffer = useEditor(s => s.buffers[tab.key])
  const { load, edit, markSaved } = useEditor.getState()
  const dark = useDark()
  const openInEditor = useOpenInEditor()
  const openDialog = useDialogs(s => s.open)
  const [problems, setProblems] = useState<Problem[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<{ content: string; revision: string } | null>(null)
  const [reveal, setReveal] = useState<{ line: number; column?: number | null; at: number } | null>(null)
  const dirty = isDirty(buffer)
  const disk = source.disk

  // Load the file; follow changes made on disk while there's nothing unsaved
  useEffect(() => {
    if (!disk) return
    const current = useEditor.getState().buffers[tab.key]
    if (!current || (!isDirty(current) && current.revision !== disk.revision)) load(tab.key, disk.content, disk.revision)
  }, [disk, tab.key, load])
  const changedOnDisk = !!disk && !!buffer && dirty && buffer.revision !== disk.revision && !conflict

  const shown = useMemo<Problem[]>(() => {
    if (problems) return problems
    const e = source.initialBuild?.error
    return e ? [{ severity: 'error', message: e.message, line: e.line, column: e.column }] : []
  }, [problems, source.initialBuild])

  const save = async (revision = buffer?.revision ?? null) => {
    if (!buffer || saving) return
    const content = buffer.content
    setSaving(true)
    try {
      const outcome = await source.save(content, revision)
      if (outcome.kind === 'saved') {
        markSaved(tab.key, content, outcome.revision)
        setProblems(outcome.problems)
        setConflict(null)
        const errors = outcome.problems.filter(p => p.severity === 'error').length
        if (errors) toast.error(`Saved, but it doesn't build (${errors} ${errors === 1 ? 'error' : 'errors'})`)
        else toast.success(`Saved ${source.file}`)
      } else if (outcome.kind === 'invalid') {
        setProblems(outcome.problems)
        toast.error('Not saved: fix the problems first')
      } else {
        setConflict(outcome.disk)
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (source.loading || (!buffer && !source.error)) return <div className="p-6"><Spinner label={`Opening ${tab.id}`} /></div>
  if (source.error || !buffer) return <p role="alert" className="p-6 text-sm text-danger">{errorMessage(source.error)}</p>

  const bytes = new TextEncoder().encode(buffer.content).length
  const counts = { error: shown.filter(p => p.severity === 'error').length, warning: shown.filter(p => p.severity === 'warning').length }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-1.5">
        <span className="truncate font-mono text-xs text-muted">{source.file}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {tab.kind === 'function' && <>
            <Button size="sm" variant="ghost" onClick={() => openDialog('production', tab.id)}><FileOutput size={13} /> Production build</Button>
            <Button size="sm" variant="ghost" onClick={() => openInEditor.mutate(tab.id)}><ExternalLink size={13} /> VS Code</Button>
          </>}
          <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => disk && load(tab.key, disk.content, disk.revision)} title="Discard unsaved changes">
            <RotateCcw size={13} /> Revert
          </Button>
          <Button size="sm" variant="primary" disabled={!dirty || saving} onClick={() => save()} title="Save (Ctrl+S / ⌘S)">
            <Save size={13} /> {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {changedOnDisk && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-warn/40 bg-surface px-3 py-2 text-sm">
          <AlertTriangle size={15} className="text-warn" aria-hidden />
          <span>{source.file} changed on disk while you were editing.</span>
          <Button size="sm" onClick={() => setConflict(disk)}><GitCompare size={13} /> Compare</Button>
          <Button size="sm" variant="ghost" onClick={() => load(tab.key, disk.content, disk.revision)}>Use the disk version</Button>
        </div>
      )}

      {conflict ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2 text-sm">
            <GitCompare size={15} className="text-warn" aria-hidden />
            <span>The file changed on disk. Left: on disk. Right: your version.</span>
            <Button size="sm" variant="primary" onClick={() => save(conflict.revision)}>Keep my version</Button>
            <Button size="sm" onClick={() => { load(tab.key, conflict.content, conflict.revision); setConflict(null) }}>Use the disk version</Button>
            <Button size="sm" variant="ghost" onClick={() => setConflict(null)}>Back to editing</Button>
          </div>
          <div className="min-h-0 flex-1"><DiffView original={conflict.content} modified={buffer.content} language={source.language} dark={dark} /></div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <CodeEditor path={source.uri} language={source.language} value={buffer.content} dark={dark}
            onChange={v => edit(tab.key, v)} onSave={() => void save()} problems={shown} reveal={reveal} />
        </div>
      )}

      {shown.length > 0 && (
        <ul aria-label="Problems" className="max-h-32 overflow-y-auto border-t border-line bg-surface text-xs">
          {shown.map((p, i) => (
            <li key={i}>
              <button type="button" disabled={p.line === null} onClick={() => p.line && setReveal({ line: p.line, column: p.column, at: Date.now() })}
                className="flex w-full items-start gap-2 px-3 py-1 text-left hover:bg-surface-2 disabled:cursor-default">
                {problemIcon[p.severity]}
                <span className="min-w-0 flex-1 break-words">{p.message}</span>
                {p.line !== null && <span className="shrink-0 font-mono text-muted">line {p.line}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-4 border-t border-line bg-surface px-3 py-1 text-xs text-muted" role="status">
        <span>{dirty ? 'Unsaved changes' : 'Saved'}</span>
        {(counts.error > 0 || counts.warning > 0) && <span>{counts.error} errors · {counts.warning} warnings</span>}
        {source.runtime && <span className="font-mono">{source.runtime}</span>}
        {source.sizeLimit && <SizeMeter bytes={bytes} limit={source.sizeLimit} />}
        <span className="ml-auto">Ctrl+S / ⌘S to save</span>
      </div>
    </div>
  )
}
