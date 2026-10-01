import type { HeaderMap, RecordedEvent, RequestSummary, StageInfo } from '@contract'

/** How many requests the UI keeps (the server keeps more; older ones can still be fetched). */
export const MAX_REQUESTS = 5000

export interface StageSnapshot {
  name: string
  stage: StageInfo | null
  uri?: string
  status?: number | string
  headers?: HeaderMap
  body?: string
  bodySize?: number
  bodyTruncated?: boolean
  bodyUnchanged?: boolean
  contentType?: string
}

/** One request's journey through the distribution, built from its events. */
export interface Journey {
  id: string
  time: string
  method?: string
  url?: string
  requestHeaders?: HeaderMap
  status?: number
  responseHeaders?: HeaderMap
  durationMs?: number
  failure?: string
  stages: StageSnapshot[]
  /** Only the summary is known (from history); the stages can be fetched. */
  partial: boolean
}

export interface TrafficState {
  byId: Record<string, Journey>
  /** Newest first. */
  order: string[]
}

export const emptyTraffic = (): TrafficState => ({ byId: {}, order: [] })

const isRequestEvent = (e: RecordedEvent) => e.type.startsWith('request.') && !!e.requestId

/** Applies one event to its journey (a pure function: returns a new state when something changed). */
export function applyEvent(state: TrafficState, event: RecordedEvent): TrafficState {
  if (!isRequestEvent(event)) return state
  const id = event.requestId!
  const existing = state.byId[id]
  const journey: Journey = existing ? { ...existing, stages: existing.stages } : { id, time: event.time, stages: [], partial: false }

  switch (event.type) {
    case 'request.started':
      journey.time = event.time
      journey.method = event.data.method
      journey.url = event.data.url
      journey.requestHeaders = event.data.headers
      break
    case 'request.stage':
      journey.stages = [...journey.stages, { ...event.data }]
      break
    case 'request.completed':
      journey.status = event.data.status
      journey.responseHeaders = event.data.headers
      journey.durationMs = event.data.durationMs
      break
    case 'request.failed':
      journey.failure = event.data.message
      break
  }

  const byId = { ...state.byId, [id]: journey }
  if (existing) return { byId, order: state.order }
  const order = [id, ...state.order]
  // Drop the oldest beyond the cap
  for (const dropped of order.splice(MAX_REQUESTS)) delete byId[dropped]
  return { byId, order }
}

/** Replaces a journey with its full recorded events (fetched from history), keeping its place in the list. */
export function hydrate(state: TrafficState, id: string, events: RecordedEvent[]): TrafficState {
  let rebuilt = emptyTraffic()
  for (const e of events) rebuilt = applyEvent(rebuilt, e)
  const full = rebuilt.byId[id]
  if (!full) return state
  return {
    byId: { ...state.byId, [id]: { ...full, partial: false } },
    order: state.order.includes(id) ? state.order : [id, ...state.order],
  }
}

/** Seeds the list from history summaries (newest first), keeping journeys already known. */
export function seed(state: TrafficState, items: RequestSummary[]): TrafficState {
  const byId = { ...state.byId }
  const known = new Set(state.order)
  const added: string[] = []
  for (const item of items) {
    if (known.has(item.id)) continue
    byId[item.id] = {
      id: item.id, time: item.time, method: item.method, url: item.url, status: item.status,
      durationMs: item.durationMs, failure: item.failed ? 'Request failed' : undefined, stages: [], partial: true,
    }
    added.push(item.id)
  }
  const order = [...state.order, ...added].sort((a, b) => byId[b].time.localeCompare(byId[a].time)).slice(0, MAX_REQUESTS)
  return { byId: Object.fromEntries(order.map(id => [id, byId[id]])), order }
}
