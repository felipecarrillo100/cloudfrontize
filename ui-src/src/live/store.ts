import { create } from 'zustand'
import type { Diagnostic, RecordedEvent, RequestSummary } from '@contract'
import { applyEvent, emptyTraffic, hydrate, seed, type TrafficState } from './traffic'

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting'

interface LiveState {
  connection: ConnectionStatus
  /** Last event sequence number seen. */
  seq: number
  traffic: TrafficState
  /** Set when the manifest on disk can't be loaded (the previous version keeps running). */
  invalidManifest: Diagnostic[] | null
  setConnection(status: ConnectionStatus): void
  ingest(event: RecordedEvent, seq?: number): void
  seedHistory(items: RequestSummary[]): void
  hydrateRequest(id: string, events: RecordedEvent[]): void
  clearTraffic(): void
  setInvalidManifest(diagnostics: Diagnostic[] | null): void
}

/**
 * Live state fed by the event stream. Components select just what they need, so a burst of traffic
 * only re-renders the traffic views.
 */
export const useLive = create<LiveState>()(set => ({
  connection: 'connecting',
  seq: 0,
  traffic: emptyTraffic(),
  invalidManifest: null,
  setConnection: connection => set({ connection }),
  ingest: (event, seq) => set(s => ({ traffic: applyEvent(s.traffic, event), seq: seq ?? s.seq })),
  seedHistory: items => set(s => ({ traffic: seed(s.traffic, items) })),
  hydrateRequest: (id, events) => set(s => ({ traffic: hydrate(s.traffic, id, events) })),
  clearTraffic: () => set({ traffic: emptyTraffic() }),
  setInvalidManifest: invalidManifest => set({ invalidManifest }),
}))
