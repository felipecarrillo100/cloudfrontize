import { describe, expect, test } from 'vitest'
import type { DistributionBehavior, DistributionFunction } from '@contract'
import { matchBehavior, slotOptions } from './rules'

const fn = (id: string, type: DistributionFunction['type']): DistributionFunction =>
  ({ id, type, runtime: null, file: null, path: `/p/${id}.js`, disabled: false, build: { status: 'ok' } })
const functions = [fn('cff', 'cloudfront-function'), fn('lae', 'lambda-edge'), fn('lae2', 'lambda-edge')]
const behavior = (functions: DistributionBehavior['functions'] = {}): DistributionBehavior => ({ key: 'default', pathPattern: null, origin: 'web', functions })

describe('slot rules (AWS: combining CloudFront Functions with Lambda@Edge)', () => {
  test('origin events take Lambda@Edge only', () => {
    const o = slotOptions(behavior(), 'origin-request', functions)
    expect(o.types['cloudfront-function']).toEqual({ allowed: false, reason: 'CloudFront Functions run only on viewer events' })
    expect(o.types['lambda-edge'].allowed).toBe(true)
    expect(o.existing.find(e => e.fn.id === 'cff')).toMatchObject({ allowed: false })
  })

  test('an empty behavior allows both kinds on viewer events', () => {
    const o = slotOptions(behavior(), 'viewer-request', functions)
    expect(o.types['cloudfront-function'].allowed).toBe(true)
    expect(o.types['lambda-edge'].allowed).toBe(true)
  })

  test('a function on one viewer event locks the other viewer event to the same kind', () => {
    const withCff = slotOptions(behavior({ 'viewer-response': 'cff' }), 'viewer-request', functions)
    expect(withCff.types['lambda-edge']).toMatchObject({ allowed: false, reason: expect.stringContaining("AWS doesn't allow both kinds") })
    expect(withCff.types['cloudfront-function'].allowed).toBe(true)

    const withLae = slotOptions(behavior({ 'viewer-request': 'lae' }), 'viewer-response', functions)
    expect(withLae.types['cloudfront-function'].allowed).toBe(false)
  })

  test('origin events don\'t lock viewer events (CFF viewer + L@E origin is allowed)', () => {
    const o = slotOptions(behavior({ 'origin-request': 'lae' }), 'viewer-request', functions)
    expect(o.types['cloudfront-function'].allowed).toBe(true)
  })

  test('existing functions exclude the one already in the slot', () => {
    const o = slotOptions(behavior({ 'origin-request': 'lae' }), 'origin-request', functions)
    expect(o.existing.map(e => e.fn.id)).toEqual(['cff', 'lae2'])
  })
})

describe('matchBehavior', () => {
  const behaviors: DistributionBehavior[] = [
    { key: '/img/??.png', pathPattern: '/img/??.png', origin: 'a', functions: {} },
    { key: '/api/*', pathPattern: '/api/*', origin: 'b', functions: {} },
    { key: 'default', pathPattern: null, origin: 'c', functions: {} },
  ]
  test('first match wins; ? is one character; the default catches the rest', () => {
    expect(matchBehavior(behaviors, '/img/ab.png')?.origin).toBe('a')
    expect(matchBehavior(behaviors, '/img/abc.png')?.origin).toBe('c')
    expect(matchBehavior(behaviors, '/api/users')?.origin).toBe('b')
    expect(matchBehavior(behaviors, '/')?.origin).toBe('c')
  })
})
