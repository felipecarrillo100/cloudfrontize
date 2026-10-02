import type { EdgeEvent } from '@contract'

/**
 * The manifest as written in cloudfrontize.json (no defaults applied, so optional fields may be
 * missing). Edits work on this shape; the server validates the result.
 */
export interface DraftBehavior {
  pathPattern?: string
  origin: string
  functions?: Partial<Record<EdgeEvent, string>>
}

export interface DraftOrigin {
  id: string
  type: string
  path?: string
  bucket?: string
  region?: string
  endpoint?: string
  forcePathStyle?: boolean
  mode?: string
  credentials?: { profile?: string; fromEnv?: boolean }
}

export interface DraftManifest {
  origins: DraftOrigin[]
  defaultBehavior: DraftBehavior
  behaviors?: DraftBehavior[]
  distribution?: Record<string, unknown>
  keyValueStores?: Record<string, { file: string }>
  [key: string]: unknown
}

export const asDraft = (manifest: Record<string, unknown>) => manifest as unknown as DraftManifest
