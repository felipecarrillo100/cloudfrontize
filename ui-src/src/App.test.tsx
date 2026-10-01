import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import type { Distribution } from '@contract'
import { apiV2, renderWithQuery, server } from '@/test/utils'
import { useLive } from '@/live/store'
import { useUI } from '@/state/ui'
import { App } from './App'

/** A stand-in for the browser's EventSource that tests can push events through. */
class FakeEventSource {
  static last: FakeEventSource | null = null
  static readonly CLOSED = 2
  readyState = 1
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  url: string
  constructor(url: string) { this.url = url; FakeEventSource.last = this; setTimeout(() => this.onopen?.(), 0) }
  push(event: object) { this.onmessage?.({ data: JSON.stringify(event) }) }
  close() { this.readyState = 2 }
}

const info = { apiVersion: 2, version: '3.0.0', ports: { main: 3000, webui: 3001 }, project: { name: 'Shop', dir: '/p/shop' }, legacy: false, routes: [] }
const dist: Distribution = {
  mode: 'project',
  project: { name: 'Shop', dir: '/p/shop', revision: 'r1' },
  functions: [
    { id: 'auth', type: 'lambda-edge', runtime: 'nodejs22.x', file: 'functions/lambda-edge/viewer-request.auth.js', path: '/p/shop/functions/lambda-edge/viewer-request.auth.js', disabled: false, build: { status: 'ok' } },
    { id: 'idx', type: 'cloudfront-function', runtime: 'cloudfront-js-2.0', file: 'functions/cloudfront/viewer-request.idx.js', path: '/p/x', disabled: false, build: { status: 'error', error: { message: 'Unexpected token', line: 4 } } },
  ],
  behaviors: [
    { key: '/admin/*', pathPattern: '/admin/*', origin: 'web', functions: { 'viewer-request': 'auth' } },
    { key: 'default', pathPattern: null, origin: 'web', functions: { 'viewer-request': 'idx' } },
  ],
  origins: [{ id: 'web', type: 'local', path: 'origins/www' }],
}
const project = { name: 'Shop', dir: '/p/shop', manifestPath: '/p/shop/cloudfrontize.json', revision: 'r1', manifest: {}, diagnostics: [] }

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource)
    useUI.setState({ view: null })
    useLive.getState().clearTraffic()
    server.use(apiV2.get('', info), apiV2.get('/distribution', dist), apiV2.get('/project', project), apiV2.get('/requests', { items: [], seq: 0 }), apiV2.get('/kvs', { items: [] }))
  })
  afterEach(() => vi.unstubAllGlobals())

  test('with a project open, shows the workbench: behaviors, slots, functions and build state', async () => {
    renderWithQuery(<App />)
    expect(await screen.findByRole('button', { name: /Shop/ })).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: /\/admin\/\*/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Default/ })).toBeInTheDocument()
    // The default behavior's viewer-request runs idx, whose build failed
    expect(screen.getByRole('button', { name: 'CloudFront Function idx on viewer-request, build error' })).toBeInTheDocument()
    expect(screen.getByText('build error · line 4')).toBeInTheDocument()
    expect(await screen.findByText('The project follows every AWS rule CloudFrontize checks.')).toBeInTheDocument()
  })

  test('live events appear in the traffic list', async () => {
    renderWithQuery(<App />)
    await screen.findByRole('tab', { name: /Default/ })
    const es = FakeEventSource.last!
    act(() => {
      es.push({ v: 2, seq: 0, time: 't', type: 'stream.hello', data: { apiVersion: 2, version: '3', seq: 0, resumed: true } })
      es.push({ v: 2, seq: 1, time: '2026-10-01T10:00:00Z', type: 'request.started', requestId: 'r1', data: { method: 'GET', url: '/admin/', headers: {} } })
      es.push({ v: 2, seq: 2, time: '2026-10-01T10:00:00Z', type: 'request.completed', requestId: 'r1', data: { status: 401, headers: {}, durationMs: 4 } })
    })
    const traffic = await screen.findByRole('listbox', { name: 'Requests' })
    expect(within(traffic).getByText('/admin/')).toBeInTheDocument()
    expect(within(traffic).getByText('401')).toBeInTheDocument()
  })

  test('an invalid manifest edit on disk is shown with its diagnostics', async () => {
    renderWithQuery(<App />)
    await screen.findByRole('tab', { name: /Default/ })
    act(() => FakeEventSource.last!.push({
      v: 2, seq: 3, time: 't', type: 'project.invalid',
      data: { name: 'Shop', dir: '/p/shop', revision: 'r2', diagnostics: [{ severity: 'error', path: '', rule: 'invalid-json', message: 'Not valid JSON' }] },
    }))
    expect(await screen.findByText(/can't be loaded. The previous version keeps running/)).toBeInTheDocument()
    expect(screen.getByText('Not valid JSON')).toBeInTheDocument()
  })

  test('without a project or a 2.x setup, starts on the start screen', async () => {
    server.use(apiV2.get('', { ...info, project: null }), apiV2.get('/projects/recent', { items: [] }))
    renderWithQuery(<App />)
    expect(await screen.findByRole('button', { name: /New project/ })).toBeInTheDocument()
  })
})
