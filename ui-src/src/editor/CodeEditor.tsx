import { lazy, Suspense } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import type { CodeEditorProps, DiffViewProps } from './MonacoEditor'

// Monaco is large: it's loaded the first time a file is opened
const LazyEditor = lazy(() => import('./MonacoEditor').then(m => ({ default: m.MonacoCodeEditor })))
const LazyDiff = lazy(() => import('./MonacoEditor').then(m => ({ default: m.MonacoDiffView })))

const loading = <div className="flex h-full items-center justify-center"><Spinner label="Loading the editor" /></div>

export function CodeEditor(props: CodeEditorProps) {
  return <Suspense fallback={loading}><LazyEditor {...props} /></Suspense>
}

export function DiffView(props: DiffViewProps) {
  return <Suspense fallback={loading}><LazyDiff {...props} /></Suspense>
}
