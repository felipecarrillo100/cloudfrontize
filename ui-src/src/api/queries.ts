import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  FunctionDetail,
  ControlAction, Distribution, FolderListing, ProjectInfo, RecentProject, RequestDetail, RequestSummary, ServerInfo,
} from '@contract'
import { api } from './client'

/** Query keys: one place, so invalidation after events and mutations stays consistent. */
export const keys = {
  server: ['server'] as const,
  project: ['project'] as const,
  distribution: ['distribution'] as const,
  recent: ['recent'] as const,
  folder: (path: string | null) => ['folder', path] as const,
  requests: ['requests'] as const,
  request: (id: string) => ['request', id] as const,
}

export const useServerInfo = () =>
  useQuery({ queryKey: keys.server, queryFn: () => api<ServerInfo>('GET', ''), staleTime: 30_000 })

export const useProject = (enabled: boolean) =>
  useQuery({ queryKey: keys.project, queryFn: () => api<ProjectInfo>('GET', '/project'), enabled })

export const useDistribution = () =>
  useQuery({ queryKey: keys.distribution, queryFn: () => api<Distribution>('GET', '/distribution') })

export const useRecentProjects = () =>
  useQuery({ queryKey: keys.recent, queryFn: async () => (await api<{ items: RecentProject[] }>('GET', '/projects/recent')).items })

/** A folder listing; `null` lists the first browse root. */
export const useFolder = (path: string | null, hidden = false, enabled = true) =>
  useQuery({
    enabled,
    queryKey: [...keys.folder(path), hidden],
    queryFn: () => api<FolderListing>('GET', `/fs/list?${new URLSearchParams({ ...(path ? { path } : {}), ...(hidden ? { hidden: 'true' } : {}) })}`),
    placeholderData: prev => prev,
    retry: false,
  })

export const useFunctionDetail = (id: string, enabled: boolean) =>
  useQuery({ queryKey: ['function', id], queryFn: () => api<FunctionDetail>('GET', `/functions/${encodeURIComponent(id)}`), enabled })

export const useRequestHistory = () =>
  useQuery({ queryKey: keys.requests, queryFn: () => api<{ items: RequestSummary[]; seq: number }>('GET', '/requests?limit=500'), staleTime: Infinity })

export const useRequestDetail = (id: string, enabled: boolean) =>
  useQuery({ queryKey: keys.request(id), queryFn: () => api<RequestDetail>('GET', `/requests/${encodeURIComponent(id)}`), enabled, staleTime: Infinity })

/** After opening or creating a project, everything the UI knows is about another project. */
function useResetAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

export function useOpenProject() {
  const reset = useResetAll()
  return useMutation({
    mutationFn: (path: string) => api<{ name: string; dir: string }>('POST', '/projects/open', { path }),
    onSuccess: reset,
  })
}

export interface CreateProjectInput {
  dir: string
  name: string
  origin?: Record<string, unknown>
}

export function useCreateProject() {
  const reset = useResetAll()
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api<{ dir: string }>('POST', '/projects', input),
    onSuccess: reset,
  })
}

export function useForgetRecent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dir: string) => api<void>('DELETE', `/projects/recent?dir=${encodeURIComponent(dir)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.recent }),
  })
}

export function useReloadProject() {
  const reset = useResetAll()
  return useMutation({ mutationFn: () => api('POST', '/project/reload'), onSuccess: reset })
}

/** Switch a function on or off (or isolate it) for testing; not saved in the project. */
export function useControl() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { action: ControlAction; function?: string }) => api<Distribution>('POST', '/controls', input),
    onSuccess: dist => qc.setQueryData(keys.distribution, dist),
  })
}
