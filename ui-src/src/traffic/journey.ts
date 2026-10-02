import type { HeaderMap, StageInfo } from '@contract'
import type { Journey, StageSnapshot } from '@/live/traffic'

/** One step of a request's trip through the distribution, as the journey view shows it. */
export interface Step {
  key: string
  label: string
  /** What ran or happened, for the icon and color. */
  kind: 'viewer' | 'function' | 'short-circuit' | 'origin' | 'response'
  runtime?: 'cloudfront-function' | 'lambda-edge'
  functionIds: string[]
  /** Request-side steps compare with the previous request state, response-side with the previous response. */
  side: 'request' | 'response'
  uri?: string
  status?: number | string
  headers?: HeaderMap
  body?: StageSnapshot['body']
  bodySize?: number
  bodyTruncated?: boolean
  bodyUnchanged?: boolean
  contentType?: string
}

const short = (runtime: 'cloudfront-function' | 'lambda-edge') => (runtime === 'cloudfront-function' ? 'CloudFront Function' : 'Lambda@Edge')

function describe(stage: StageInfo | null, name: string): Pick<Step, 'label' | 'kind' | 'runtime' | 'functionIds' | 'side'> {
  if (!stage) return { label: name, kind: 'function', functionIds: [], side: 'request' }
  switch (stage.kind) {
    case 'function': {
      const side = stage.event.endsWith('-request') ? 'request' : 'response'
      return { label: `${stage.event} · ${short(stage.runtime)} ${stage.functionIds.join(', ')}`, kind: 'function', runtime: stage.runtime, functionIds: stage.functionIds, side }
    }
    case 'short-circuit':
      return { label: `Generated response · ${stage.functionIds.join(', ')}`, kind: 'short-circuit', runtime: stage.runtime, functionIds: stage.functionIds, side: 'response' }
    case 'origin-fetch':
      return { label: `Request to origin ${stage.origin}`, kind: 'origin', functionIds: [], side: 'request' }
    case 'origin-response':
      return { label: 'Origin response', kind: 'origin', functionIds: [], side: 'response' }
    case 'final-response':
      return { label: 'Response to the viewer', kind: 'response', functionIds: [], side: 'response' }
  }
}

/** The journey as steps: the viewer's request, then every stage the pipeline reported. */
export function stepsOf(j: Journey): Step[] {
  const first: Step = {
    key: 'viewer', label: 'Viewer request', kind: 'viewer', functionIds: [], side: 'request',
    uri: j.url, headers: j.requestHeaders, ...j.requestBody,
  }
  return [first, ...j.stages.map((s, i) => ({ key: `s${i}`, ...describe(s.stage, s.name), uri: s.uri, status: s.status, headers: s.headers, body: s.body, bodySize: s.bodySize, bodyTruncated: s.bodyTruncated, bodyUnchanged: s.bodyUnchanged, contentType: s.contentType }))]
}

/** The step a step's headers should be compared with (the previous state on the same side), if any. */
export function previousOf(steps: Step[], index: number): Step | undefined {
  const step = steps[index]
  for (let i = index - 1; i >= 0; i--) {
    if (steps[i].side === step.side && steps[i].headers) return steps[i]
    // The first response-side step starts the response: nothing before it to compare with
    if (step.side === 'response' && steps[i].side === 'request') return undefined
  }
  return undefined
}

export interface HeaderChange {
  name: string
  kind: 'added' | 'removed' | 'changed' | 'same'
  before?: string
  after?: string
}

const flat = (v: string | string[]) => (Array.isArray(v) ? v.join(', ') : v)

/** What changed between two header snapshots (names compared case-insensitively). */
export function diffHeaders(before: HeaderMap | undefined, after: HeaderMap | undefined): HeaderChange[] {
  const index = (m?: HeaderMap) => new Map(Object.entries(m ?? {}).map(([k, v]) => [k.toLowerCase(), { name: k, value: flat(v) }]))
  const a = index(before)
  const b = index(after)
  const out: HeaderChange[] = []
  for (const [key, { name, value }] of b) {
    const old = a.get(key)
    if (!old) out.push({ name, kind: before ? 'added' : 'same', after: value })
    else if (old.value !== value) out.push({ name, kind: 'changed', before: old.value, after: value })
    else out.push({ name, kind: 'same', after: value })
  }
  if (before) for (const [key, { name, value }] of a) if (!b.has(key)) out.push({ name, kind: 'removed', before: value })
  const order = { added: 0, changed: 1, removed: 2, same: 3 }
  return out.sort((x, y) => order[x.kind] - order[y.kind] || x.name.localeCompare(y.name))
}

const TEXT = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded)|[^;]*\+(json|xml))/i

/** A body snapshot as text, when it's textual and complete; null otherwise. */
export function decodeBody(body: string | undefined, contentType: string | undefined, truncated?: boolean): string | null {
  if (!body || truncated || !TEXT.test(contentType ?? '')) return null
  try {
    const bytes = Uint8Array.from(atob(body), c => c.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
// Headers curl sets itself, or that only make sense on the original connection
const SKIP = new Set(['host', 'content-length', 'connection', 'accept-encoding'])

/** The viewer's request as a curl command against the distribution. */
export function curlOf(j: Journey, port: number): string {
  const parts = ['curl', '-i']
  if (j.method && j.method !== 'GET') parts.push('-X', j.method)
  parts.push(quote(`http://localhost:${port}${j.url ?? '/'}`))
  for (const [name, value] of Object.entries(j.requestHeaders ?? {})) {
    if (SKIP.has(name.toLowerCase())) continue
    for (const v of Array.isArray(value) ? value : [value]) parts.push('-H', quote(`${name}: ${v}`))
  }
  const text = decodeBody(j.requestBody?.body, j.requestBody?.contentType, j.requestBody?.bodyTruncated)
  if (text !== null) parts.push('--data-binary', quote(text))
  return parts.join(' ')
}

export const statusTone = (status?: number, failed?: boolean) =>
  failed || (status ?? 0) >= 500 ? 'text-danger' : (status ?? 0) >= 400 ? 'text-warn' : (status ?? 0) >= 300 ? 'text-response' : status ? 'text-ok' : 'text-muted'
