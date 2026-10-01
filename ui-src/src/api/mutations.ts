import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  EdgeEvent, FunctionInfo, FunctionType, OriginCheck, ProductionCode, ProductionLevel, ProjectInfo, SaveResult, ViewerHeadersFile,
} from '@contract'
import { ApiRequestError, api, errorMessage } from './client'
import { keys } from './queries'
import { asDraft, type DraftManifest } from './draft'

/** Everything a project edit can change. */
function useRefreshProject() {
  const qc = useQueryClient()
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: keys.project }),
    qc.invalidateQueries({ queryKey: keys.distribution }),
    qc.invalidateQueries({ queryKey: keys.server }),
    qc.invalidateQueries({ queryKey: ['viewer-headers'] }),
    qc.invalidateQueries({ queryKey: ['function'] }),
    qc.invalidateQueries({ queryKey: ['kvs'] }),
  ])
}

/**
 * Reports a failed project edit. A 409 means the manifest changed meanwhile (an editor, git, another
 * tab): the UI reloads it and the user tries again, so nothing anyone wrote is overwritten.
 */
export function reportEditError(err: unknown) {
  if (err instanceof ApiRequestError && err.status === 409 && err.code === 'conflict') {
    toast.error('The project changed meanwhile, so this change wasn\'t saved', { description: 'It has been reloaded: try again.' })
  } else if (err instanceof ApiRequestError && err.diagnostics.length) {
    const errors = err.diagnostics.filter(d => d.severity === 'error')
    toast.error(errors.length === 1 ? errors[0].message : `${errors.length} AWS rules would be broken`, {
      description: errors.length > 1 ? errors.map(d => d.message).join('\n') : undefined,
    })
  } else {
    toast.error(errorMessage(err))
  }
}

/**
 * Edits the manifest: applies `edit` to the manifest as written and saves it with the revision it
 * was based on. The server validates every AWS rule and reloads the project.
 */
export function useManifestEdit() {
  const qc = useQueryClient()
  const refresh = useRefreshProject()
  return useMutation({
    mutationFn: async (edit: (manifest: DraftManifest) => void) => {
      const project = await qc.fetchQuery({ queryKey: keys.project, queryFn: () => api<ProjectInfo>('GET', '/project'), staleTime: 0 })
      const draft = asDraft(structuredClone(project.manifest))
      edit(draft)
      return api<SaveResult>('PUT', '/project/manifest', { manifest: draft, revision: project.revision })
    },
    onSettled: refresh,
  })
}

export interface NewFunctionInput {
  id: string
  type: FunctionType
  event: EdgeEvent
  runtime?: string
  behavior?: string
  replace?: boolean
}

export function useCreateFunction() {
  const refresh = useRefreshProject()
  return useMutation({
    mutationFn: (input: NewFunctionInput) => api<{ function: FunctionInfo }>('POST', '/functions', input),
    onSettled: refresh,
  })
}

const behaviorPath = (behavior: string, event: EdgeEvent) => `/behaviors/${encodeURIComponent(behavior)}/functions/${event}`

export function useAttachFunction() {
  const refresh = useRefreshProject()
  return useMutation({
    mutationFn: ({ behavior, event, id }: { behavior: string; event: EdgeEvent; id: string }) => api('PUT', behaviorPath(behavior, event), { function: id }),
    onSettled: refresh,
  })
}

export function useDetachFunction() {
  const refresh = useRefreshProject()
  return useMutation({
    mutationFn: ({ behavior, event }: { behavior: string; event: EdgeEvent }) => api('DELETE', behaviorPath(behavior, event)),
    onSettled: refresh,
  })
}

export function useUpdateFunction() {
  const refresh = useRefreshProject()
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: string; newId?: string; runtime?: string; keyValueStore?: string | null }) =>
      api<{ function: FunctionInfo }>('PATCH', `/functions/${encodeURIComponent(id)}`, {
        ...(changes.newId ? { id: changes.newId } : {}),
        ...(changes.runtime ? { runtime: changes.runtime } : {}),
        ...(changes.keyValueStore !== undefined ? { keyValueStore: changes.keyValueStore } : {}),
      }),
    onSettled: refresh,
  })
}

export function useDeleteFunction() {
  const refresh = useRefreshProject()
  return useMutation({
    mutationFn: ({ id, deleteFile }: { id: string; deleteFile: boolean }) =>
      api('DELETE', `/functions/${encodeURIComponent(id)}${deleteFile ? '?deleteFile=true' : ''}`),
    onSettled: refresh,
  })
}

export function useOpenInEditor() {
  return useMutation({
    mutationFn: (id: string) => api('POST', `/functions/${encodeURIComponent(id)}/open-in-editor`),
    onError: err => toast.error(errorMessage(err)),
  })
}

export const useProductionCode = (id: string, level: ProductionLevel, enabled: boolean) =>
  useQuery({
    queryKey: ['production', id, level],
    queryFn: () => api<ProductionCode>('GET', `/functions/${encodeURIComponent(id)}/production?level=${level}`),
    enabled,
    staleTime: 0,
  })

export function useCheckOrigin() {
  return useMutation({ mutationFn: (id: string) => api<OriginCheck>('POST', `/origins/${encodeURIComponent(id)}/check`) })
}

export function useAddOrigin() {
  const refresh = useRefreshProject()
  return useMutation({
    mutationFn: (origin: Record<string, unknown>) => api<SaveResult>('POST', '/origins', origin),
    onSettled: refresh,
  })
}

export function useCreateKvs() {
  const refresh = useRefreshProject()
  return useMutation({
    mutationFn: (id: string) => api('POST', '/kvs', { id }),
    onSettled: refresh,
  })
}

export const useViewerHeaders = (enabled: boolean) =>
  useQuery({ queryKey: ['viewer-headers'], queryFn: () => api<ViewerHeadersFile>('GET', '/viewer/headers'), enabled })

export function useSaveViewerHeaders() {
  const refresh = useRefreshProject()
  return useMutation({
    mutationFn: ({ content, revision }: { content: string; revision: string | null }) => api<{ file: string; revision: string }>('PUT', '/viewer/headers', { content, revision }),
    onSettled: refresh,
  })
}
