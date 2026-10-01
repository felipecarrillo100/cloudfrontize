import { CLOUDFRONT_ADDED_HEADERS } from '@contract'

/** One simulated header: sent with every request, or added to every origin response. */
export interface HeaderRow {
  key: string
  value: string
  target: 'request' | 'response'
}

const added = new Set<string>(CLOUDFRONT_ADDED_HEADERS)

/** Headers CloudFront adds (Lambda@Edge sees them only in origin events). */
export const isCloudFrontAdded = (key: string) => added.has(key.trim().toLowerCase())

/**
 * Reads a viewer headers file: either `{ "Header": "value" }` (request headers) or
 * `{ "requestHeaders": {...}, "responseHeaders": {...} }`, as the server reads it.
 */
export function parseHeaders(content: string | null): HeaderRow[] {
  if (!content?.trim()) return []
  const data = JSON.parse(content) as Record<string, unknown>
  const keyOf = (name: string) => Object.keys(data).find(k => k.toLowerCase() === name)
  const reqKey = keyOf('requestheaders')
  const resKey = keyOf('responseheaders')
  const rows = (source: unknown, target: HeaderRow['target']) =>
    Object.entries((source ?? {}) as Record<string, unknown>).map(([key, value]) => ({ key, value: String(value), target }))
  if (!reqKey && !resKey) return rows(data, 'request')
  return [...rows(reqKey ? data[reqKey] : {}, 'request'), ...rows(resKey ? data[resKey] : {}, 'response')]
}

/** Writes rows back: the simple form when there are only request headers. Empty names are dropped. */
export function serializeHeaders(rows: HeaderRow[]): string {
  const pick = (target: HeaderRow['target']) =>
    Object.fromEntries(rows.filter(r => r.target === target && r.key.trim()).map(r => [r.key.trim(), r.value]))
  const request = pick('request')
  const response = pick('response')
  const data = Object.keys(response).length ? { requestHeaders: request, responseHeaders: response } : request
  return JSON.stringify(data, null, 2) + '\n'
}

/** Problems to fix before saving: empty or repeated names (header names are case-insensitive). */
export function headerProblems(rows: HeaderRow[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const name = r.key.trim().toLowerCase()
    if (!name) { problems.push('A header has no name'); continue }
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(r.key.trim())) problems.push(`"${r.key}" isn't a valid header name`)
    const id = `${r.target}:${name}`
    if (seen.has(id)) problems.push(`${r.key} is listed twice`)
    seen.add(id)
  }
  return problems
}

/** Applies a preset: its headers replace the same names; device presets also clear other device flags. */
export function applyPreset(rows: HeaderRow[], headers: Record<string, string>, clearPrefix?: string): HeaderRow[] {
  const names = new Set(Object.keys(headers).map(k => k.toLowerCase()))
  const kept = rows.filter(r => r.target !== 'request' || (!names.has(r.key.toLowerCase()) && !(clearPrefix && r.key.toLowerCase().startsWith(clearPrefix))))
  return [...kept, ...Object.entries(headers).map(([key, value]) => ({ key, value, target: 'request' as const }))]
}
