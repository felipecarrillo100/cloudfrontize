import { describe, expect, test } from 'vitest'
import type { RecordedEvent } from '@contract'
import { applyEvent, emptyTraffic, hydrate, MAX_REQUESTS, seed } from './traffic'

const ev = (type: string, requestId: string, data: object, time = '2026-10-01T10:00:00.000Z') =>
  ({ v: 2, time, type, requestId, data }) as unknown as RecordedEvent

describe('traffic model', () => {
  test('builds a journey from its events', () => {
    let s = emptyTraffic()
    s = applyEvent(s, ev('request.started', 'a', { method: 'GET', url: '/x', headers: { host: 'h' } }))
    s = applyEvent(s, ev('request.stage', 'a', { name: 'Origin Fetch', stage: { kind: 'origin-fetch', origin: 'web' } }))
    s = applyEvent(s, ev('request.completed', 'a', { status: 200, headers: {}, durationMs: 3 }))
    expect(s.order).toEqual(['a'])
    expect(s.byId.a).toMatchObject({ method: 'GET', url: '/x', status: 200, durationMs: 3, partial: false })
    expect(s.byId.a.stages).toEqual([{ name: 'Origin Fetch', stage: { kind: 'origin-fetch', origin: 'web' } }])
  })

  test('is pure: the previous state is never modified', () => {
    const s1 = applyEvent(emptyTraffic(), ev('request.started', 'a', { method: 'GET', url: '/x', headers: {} }))
    const s2 = applyEvent(s1, ev('request.stage', 'a', { name: 'n', stage: null }))
    expect(s1.byId.a.stages).toEqual([])
    expect(s2.byId.a.stages).toHaveLength(1)
  })

  test('ignores non-request events, keeps the newest first, and drops the oldest beyond the cap', () => {
    let s = applyEvent(emptyTraffic(), { v: 2, time: 't', type: 'distribution.changed', data: {} } as RecordedEvent)
    expect(s.order).toEqual([])
    for (let i = 0; i < MAX_REQUESTS + 3; i++) s = applyEvent(s, ev('request.started', `r${i}`, { method: 'GET', url: '/', headers: {} }))
    expect(s.order).toHaveLength(MAX_REQUESTS)
    expect(s.order[0]).toBe(`r${MAX_REQUESTS + 2}`)
    expect(s.byId.r0).toBeUndefined()
  })

  test('history summaries are partial, sorted by time, and never replace live journeys', () => {
    let s = applyEvent(emptyTraffic(), ev('request.started', 'live', { method: 'POST', url: '/live', headers: {} }, '2026-10-01T10:00:05.000Z'))
    s = seed(s, [
      { id: 'live', time: '2026-10-01T10:00:05.000Z', method: 'GET', url: '/stale' },
      { id: 'old', time: '2026-10-01T09:00:00.000Z', method: 'GET', url: '/old', status: 404 },
    ])
    expect(s.order).toEqual(['live', 'old'])
    expect(s.byId.live.method).toBe('POST')
    expect(s.byId.old).toMatchObject({ partial: true, status: 404 })

    const full = hydrate(s, 'old', [
      ev('request.started', 'old', { method: 'GET', url: '/old', headers: {} }),
      ev('request.completed', 'old', { status: 404, headers: {} }),
    ])
    expect(full.byId.old.partial).toBe(false)
    expect(full.order).toEqual(['live', 'old'])
  })
})
