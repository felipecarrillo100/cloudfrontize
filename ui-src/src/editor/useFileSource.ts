import { useQueryClient } from '@tanstack/react-query'
import type { BuildResult, Diagnostic, FunctionBuildState, KvsProblem, SaveResult, SourceSaveResult } from '@contract'
import { api, ApiRequestError } from '@/api/client'
import { useFunctionDetail, useKvsDetail, useProject, keys } from '@/api/queries'
import type { EditorTab } from './store'
import { buildProblems, kvsProblems, manifestProblems, parseJson, type Problem } from './problems'

/** What a tab edits, whatever its kind: how to load it, how to save it, and how to show it. */
export interface FileSource {
  title: string
  /** As shown to the user (relative to the project). */
  file: string
  /** Monaco model URI. */
  uri: string
  language: 'javascript' | 'json'
  /** On disk, once loaded. */
  disk: { content: string; revision: string } | null
  loading: boolean
  error: unknown
  /** CloudFront Functions: the AWS size limit for a live meter. */
  sizeLimit: number | null
  /** The build state before any save in this session. */
  initialBuild?: FunctionBuildState
  functionType?: 'cloudfront-function' | 'lambda-edge'
  runtime?: string
  save(content: string, revision: string | null): Promise<SaveOutcome>
}

export type SaveOutcome =
  | { kind: 'saved'; revision: string; problems: Problem[]; build?: BuildResult }
  | { kind: 'invalid'; problems: Problem[] }
  | { kind: 'conflict'; disk: { content: string; revision: string } }

const formatManifest = (m: unknown) => JSON.stringify(m, null, 2) + '\n'

/** Turns a 409 (file changed meanwhile) into the disk version, for the diff view. */
function conflictOf(err: unknown, manifest = false): SaveOutcome | null {
  if (!(err instanceof ApiRequestError) || err.status !== 409 || err.code !== 'conflict') return null
  const d = err.details as { revision?: string; content?: string; manifest?: unknown } | undefined
  if (!d?.revision) return null
  const content = manifest ? (typeof d.manifest === 'string' ? d.manifest : formatManifest(d.manifest)) : d.content ?? ''
  return { kind: 'conflict', disk: { content, revision: d.revision } }
}

export function useFileSource(tab: EditorTab): FileSource {
  const qc = useQueryClient()
  const fn = useFunctionDetail(tab.id, tab.kind === 'function')
  const kvs = useKvsDetail(tab.id, tab.kind === 'kvs')
  const project = useProject(tab.kind === 'manifest')

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['function'] }),
    qc.invalidateQueries({ queryKey: ['kvs'] }),
    qc.invalidateQueries({ queryKey: keys.distribution }),
    qc.invalidateQueries({ queryKey: keys.project }),
  ])

  if (tab.kind === 'function') {
    const d = fn.data
    return {
      title: tab.id,
      file: d?.file ?? '',
      uri: `file:///project/${d?.file ?? `${tab.id}.js`}`,
      language: 'javascript',
      disk: d?.source ?? null,
      loading: fn.isLoading,
      error: fn.error,
      sizeLimit: d?.type === 'cloudfront-function' ? 10 * 1024 : null,
      initialBuild: d?.build,
      functionType: d?.type,
      runtime: d?.runtime,
      async save(content, revision) {
        try {
          const r = await api<SourceSaveResult>('PUT', `/functions/${encodeURIComponent(tab.id)}/source`, { content, revision })
          void refresh()
          return { kind: 'saved', revision: r.revision, problems: buildProblems(r.build), build: r.build }
        } catch (err) {
          const conflict = conflictOf(err)
          if (conflict) return conflict
          throw err
        }
      },
    }
  }

  if (tab.kind === 'kvs') {
    const d = kvs.data
    return {
      title: `${tab.id} (key value store)`,
      file: d?.file ?? '',
      uri: `file:///project/kvs-store/${tab.id}.json`,
      language: 'json',
      disk: d?.source ?? null,
      loading: kvs.isLoading,
      error: kvs.error,
      sizeLimit: null,
      async save(content, revision) {
        try {
          const r = await api<{ revision: string; problems: KvsProblem[] }>('PUT', `/kvs/${encodeURIComponent(tab.id)}`, { content, revision })
          void refresh()
          return { kind: 'saved', revision: r.revision, problems: kvsProblems(r.problems) }
        } catch (err) {
          const conflict = conflictOf(err)
          if (conflict) return conflict
          if (err instanceof ApiRequestError && err.code === 'invalid-kvs') {
            return { kind: 'invalid', problems: kvsProblems((err.details as { problems?: KvsProblem[] })?.problems ?? []) }
          }
          throw err
        }
      },
    }
  }

  const d = project.data
  return {
    title: 'cloudfrontize.json',
    file: 'cloudfrontize.json',
    uri: 'file:///project/cloudfrontize.json',
    language: 'json',
    disk: d ? { content: formatManifest(d.manifest), revision: d.revision } : null,
    loading: project.isLoading,
    error: project.error,
    sizeLimit: null,
    async save(content, revision) {
      const parsed = parseJson(content)
      if (parsed.problem) return { kind: 'invalid', problems: [parsed.problem] }
      try {
        const r = await api<SaveResult>('PUT', '/project/manifest', { manifest: parsed.value, revision })
        void refresh()
        return { kind: 'saved', revision: r.revision, problems: manifestProblems(content, r.diagnostics.filter(x => x.severity !== 'info')) }
      } catch (err) {
        const conflict = conflictOf(err, true)
        if (conflict) return conflict
        if (err instanceof ApiRequestError && err.diagnostics.length) return { kind: 'invalid', problems: manifestProblems(content, err.diagnostics as Diagnostic[]) }
        throw err
      }
    },
  }
}
