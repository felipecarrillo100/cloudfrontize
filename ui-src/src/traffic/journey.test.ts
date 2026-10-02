import { describe, expect, test } from 'vitest'
import type { Journey } from '@/live/traffic'
import { curlOf, decodeBody, diffHeaders, previousOf, stepsOf } from './journey'

const journey: Journey = {
  id: 'r1', time: 't', method: 'POST', url: '/api/x?y=1', partial: false,
  requestHeaders: { Host: 'localhost:3000', 'Content-Type': 'application/json', 'X-Who': "o'neil" },
  requestBody: { body: btoa('{"a":1}'), bodySize: 7, contentType: 'application/json' },
  stages: [
    { name: '[CFF: viewer-request] idx.js', stage: { kind: 'function', event: 'viewer-request', runtime: 'cloudfront-function', functionIds: ['idx'] }, headers: { Host: 'localhost:3000', 'X-Who': "o'neil", 'X-Added': '1' } },
    { name: 'Origin Fetch', stage: { kind: 'origin-fetch', origin: 'web' }, headers: { 'X-Added': '1' } },
    { name: 'Origin Response', stage: { kind: 'origin-response' }, status: 200, headers: { 'Content-Type': 'text/html' } },
    { name: '[L@E: viewer-response] h.js', stage: { kind: 'function', event: 'viewer-response', runtime: 'lambda-edge', functionIds: ['h'] }, status: 200, headers: { 'Content-Type': 'text/html', 'Strict-Transport-Security': 'max-age=1' } },
    { name: 'Final Response', stage: { kind: 'final-response' }, status: 200 },
  ],
}

describe('journey', () => {
  test('steps are labelled from structured stages, not display names', () => {
    expect(stepsOf(journey).map(s => [s.label, s.side])).toEqual([
      ['Viewer request', 'request'],
      ['viewer-request · CloudFront Function idx', 'request'],
      ['Request to origin web', 'request'],
      ['Origin response', 'response'],
      ['viewer-response · Lambda@Edge h', 'response'],
      ['Response to the viewer', 'response'],
    ])
  })

  test('a step compares with the previous state on its side; the response starts fresh', () => {
    const steps = stepsOf(journey)
    expect(previousOf(steps, 1)?.label).toBe('Viewer request')
    expect(previousOf(steps, 3)).toBeUndefined()
    expect(previousOf(steps, 4)?.label).toBe('Origin response')
  })

  test('header changes: added, changed, removed, same (case-insensitive)', () => {
    expect(diffHeaders({ A: '1', 'x-b': '2', C: '3' }, { a: '1', 'X-B': '9', D: '4' })).toEqual([
      { name: 'D', kind: 'added', after: '4' },
      { name: 'X-B', kind: 'changed', before: '2', after: '9' },
      { name: 'C', kind: 'removed', before: '3' },
      { name: 'a', kind: 'same', after: '1' },
    ])
    // Without a previous state, everything is just shown
    expect(diffHeaders(undefined, { A: ['1', '2'] })).toEqual([{ name: 'A', kind: 'same', after: '1, 2' }])
  })

  test('bodies decode only when textual and complete', () => {
    expect(decodeBody(btoa('hi'), 'text/plain')).toBe('hi')
    expect(decodeBody(btoa('hi'), 'image/png')).toBeNull()
    expect(decodeBody(btoa('hi'), 'text/plain', true)).toBeNull()
    expect(decodeBody(btoa(String.fromCharCode(0xff, 0xfe)), 'text/plain')).toBeNull()
  })

  test('copy as cURL quotes safely and skips connection headers', () => {
    expect(curlOf(journey, 3000)).toBe(
      "curl -i -X POST 'http://localhost:3000/api/x?y=1' -H 'Content-Type: application/json' -H 'X-Who: o'\\''neil' --data-binary '{\"a\":1}'",
    )
  })
})
