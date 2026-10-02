import { useEffect, useRef } from 'react'
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import { monaco } from './monacoSetup'
import type { Problem } from './problems'

export interface CodeEditorProps {
  /** Model URI: one model per file, kept while the tab is open. */
  path: string
  language: 'javascript' | 'json'
  value: string
  onChange(value: string): void
  onSave(): void
  problems: Problem[]
  dark: boolean
  readOnly?: boolean
  /** Moves the cursor to a line (problems list click). */
  reveal?: { line: number; column?: number | null; at: number } | null
}

const severity = (s: Problem['severity']) =>
  s === 'error' ? monaco.MarkerSeverity.Error : s === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info

/** Monaco, configured for function code and project JSON. Ctrl/Cmd+S saves. */
export function MonacoCodeEditor({ path, language, value, onChange, onSave, problems, dark, readOnly, reveal }: CodeEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const saveRef = useRef(onSave)
  useEffect(() => { saveRef.current = onSave }, [onSave])

  const onMount: OnMount = (editor, m) => {
    editorRef.current = editor
    editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => saveRef.current())
  }

  // Build and validation results from the server, as markers next to the code
  useEffect(() => {
    const model = monaco.editor.getModel(monaco.Uri.parse(path))
    if (!model) return
    monaco.editor.setModelMarkers(model, 'cloudfrontize', problems.filter(p => p.line !== null).map(p => {
      const line = Math.min(p.line!, model.getLineCount())
      return {
        severity: severity(p.severity), message: p.message,
        startLineNumber: line, startColumn: p.column ?? 1,
        endLineNumber: line, endColumn: model.getLineMaxColumn(line),
      }
    }))
  }, [path, problems, value])

  useEffect(() => {
    if (!reveal || !editorRef.current) return
    editorRef.current.revealLineInCenter(reveal.line)
    editorRef.current.setPosition({ lineNumber: reveal.line, column: reveal.column ?? 1 })
    editorRef.current.focus()
  }, [reveal])

  return (
    <Editor
      path={path}
      language={language}
      value={value}
      onChange={v => onChange(v ?? '')}
      onMount={onMount}
      theme={dark ? 'vs-dark' : 'vs'}
      keepCurrentModel
      options={{
        readOnly, automaticLayout: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false,
        tabSize: language === 'json' ? 2 : 4, renderWhitespace: 'selection', fixedOverflowWidgets: true,
      }}
    />
  )
}

export interface DiffViewProps {
  original: string
  modified: string
  language: 'javascript' | 'json'
  dark: boolean
}

/** Side by side: the file on disk (left) and your version (right). */
export function MonacoDiffView({ original, modified, language, dark }: DiffViewProps) {
  return (
    <DiffEditor original={original} modified={modified} language={language} theme={dark ? 'vs-dark' : 'vs'}
      options={{ readOnly: true, renderSideBySide: true, automaticLayout: true, minimap: { enabled: false }, fontSize: 13 }} />
  )
}
