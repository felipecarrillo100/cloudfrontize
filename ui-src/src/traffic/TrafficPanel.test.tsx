import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { RecordedEvent } from '@contract'
import { apiV2, renderWithQuery, server } from '@/test/utils'
import { useLive } from '@/live/store'
import { TrafficPanel } from './TrafficPanel'
import { useTrafficUI } from './store'

const ev = (type: string, requestId: string, data: object) => ({ v: 2, time: '2026-10-01T10:00:00.000Z', type, requestId, data }) as unknown as RecordedEvent
const info = { apiVersion: 2, version: '3', ports: { main: 3000, webui: 3001 }, project: null, legacy: true, routes: [] }

function record(id: string, url: string, status: number, extra: RecordedEvent[] = []) {
  const s = useLive.getState()
  s.ingest(ev('request.started', id, { method: 'GET', url, headers: { Host: 'localhost:3000', Accept: '*/*' } }))
  for (const e of extra) s.ingest(e)
  s.ingest(ev('request.completed', id, { status, headers: {}, durationMs: 3 }))
}

describe('TrafficPanel', () => {
  beforeEach(() => {
    useLive.getState().clearTraffic()
    useTrafficUI.setState({ selectedId: null, filter: 'all', search: '' })
    server.use(apiV2.get('', info))
  })

  test('lists requests newest first; filters and search narrow the list', async () => {
    record('a', '/ok', 200)
    record('b', '/missing', 404)
    record('c', '/moved', 301)
    renderWithQuery(<TrafficPanel />)
    const list = screen.getByRole('listbox', { name: 'Requests' })
    expect(within(list).getAllByRole('option').map(o => o.textContent)).toEqual([
      expect.stringContaining('/moved'), expect.stringContaining('/missing'), expect.stringContaining('/ok'),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Errors' }))
    expect(within(list).getAllByRole('option')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search requests' }), '30')
    expect(within(list).getByRole('option')).toHaveTextContent('/moved')
  })

  test('the keyboard moves through requests', async () => {
    record('a', '/first', 200)
    record('b', '/second', 200)
    renderWithQuery(<TrafficPanel />)
    screen.getByRole('listbox', { name: 'Requests' }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(useTrafficUI.getState().selectedId).toBe('b')
    await userEvent.keyboard('{ArrowDown}')
    expect(useTrafficUI.getState().selectedId).toBe('a')
  })

  test('a request\'s journey shows what each function changed', async () => {
    record('r', '/admin/', 200, [
      ev('request.stage', 'r', { name: 'x', stage: { kind: 'function', event: 'viewer-request', runtime: 'lambda-edge', functionIds: ['auth'] }, headers: { Host: 'localhost:3000', Accept: '*/*', 'X-User': 'admin' } }),
      ev('request.stage', 'r', { name: 'y', stage: { kind: 'origin-response' }, status: 200, headers: { 'Content-Type': 'text/html' }, body: btoa('<h1>Admin</h1>'), bodySize: 14, contentType: 'text/html' }),
      ev('request.stage', 'r', { name: 'z', stage: { kind: 'final-response' }, status: 200, headers: { 'Content-Type': 'text/html' } }),
    ])
    renderWithQuery(<TrafficPanel />)
    await userEvent.click(screen.getByRole('option', { name: /\/admin\// }))
    const journey = await screen.findByRole('list', { name: 'Journey' })
    expect(within(journey).getAllByRole('button').map(b => b.textContent)).toEqual([
      'Viewer request', 'viewer-request · Lambda@Edge auth', 'Origin response200', 'Response to the viewer200',
    ])
    await userEvent.click(within(journey).getByRole('button', { name: /Lambda@Edge auth/ }))
    expect(screen.getByText(/1 change since “Viewer request”/)).toBeInTheDocument()
    const added = screen.getByLabelText('added')
    expect(added.closest('tr')).toHaveTextContent('X-User')

    await userEvent.click(within(journey).getByRole('button', { name: /Origin response/ }))
    await userEvent.click(screen.getByRole('tab', { name: 'body' }))
    expect(screen.getByText('<h1>Admin</h1>')).toBeInTheDocument()
  })

  test('copy as cURL and resend', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    let invoked: unknown
    server.use(http.post('*/api/v2/invoke', async ({ request }) => { invoked = await request.json(); return HttpResponse.json({ requestId: 'new1', status: 200, headers: {}, body: '', bodyEncoding: 'text', bodySize: 0, bodyTruncated: false, durationMs: 1, journey: [] }) }))
    record('r', '/x?y=1', 200)
    renderWithQuery(<TrafficPanel />)
    await userEvent.click(screen.getByRole('option', { name: /\/x\?y=1/ }))
    await userEvent.click(await screen.findByRole('button', { name: /cURL/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("curl -i 'http://localhost:3000/x?y=1' -H 'Accept: */*'"))
    await userEvent.click(screen.getByRole('button', { name: /Resend/ }))
    await waitFor(() => expect(invoked).toEqual({ method: 'GET', path: '/x?y=1', headers: { Accept: '*/*' } }))
    expect(useTrafficUI.getState().selectedId).toBe('new1')
  })

  test('a request from history loads its journey when opened; Clear empties the list', async () => {
    let deleted = false
    server.use(
      apiV2.get('/requests/old', { id: 'old', time: 't', method: 'GET', url: '/old', status: 404, events: [ev('request.started', 'old', { method: 'GET', url: '/old', headers: {} }), ev('request.completed', 'old', { status: 404, headers: {} })] }),
      http.delete('*/api/v2/requests', () => { deleted = true; return new HttpResponse(null, { status: 204 }) }),
    )
    act(() => useLive.getState().seedHistory([{ id: 'old', time: '2026-10-01T09:00:00.000Z', method: 'GET', url: '/old', status: 404 }]))
    renderWithQuery(<TrafficPanel />)
    await userEvent.click(screen.getByRole('option', { name: /\/old/ }))
    expect(await screen.findByRole('list', { name: 'Journey' })).toBeInTheDocument()
    expect(useLive.getState().traffic.byId.old.partial).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: /Clear/ }))
    await waitFor(() => expect(deleted).toBe(true))
    expect(screen.getByText(/appear here as they happen/)).toBeInTheDocument()
  })
})
