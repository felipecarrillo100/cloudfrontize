import { beforeEach, describe, expect, test } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { apiV2, renderWithQuery, server } from '@/test/utils'
import { useTrafficUI } from '@/traffic/store'
import { ViewerInspector } from './ViewerInspector'
import { parseHeaderLines } from './viewerHeaders'

describe('Viewer: test requests and the session simulation', () => {
  beforeEach(() => useTrafficUI.setState({ selectedId: null }))

  test('header lines parse as "Name: value"', () => {
    expect(parseHeaderLines('Authorization: Basic abc\n\nX-A:  1 ')).toEqual({ headers: { Authorization: 'Basic abc', 'X-A': '1' }, error: null })
    expect(parseHeaderLines('oops').error).toBe('Line 1: use "Name: value"')
  })

  test('sends a test request, shows the response, and opens its journey in Traffic', async () => {
    let sent: unknown
    server.use(
      apiV2.get('/viewer/simulation', { source: 'session', requestHeaders: {}, responseHeaders: {} }),
      http.post('*/api/v2/invoke', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ requestId: 'abcd1234', status: 401, headers: {}, body: 'Unauthorized', bodyEncoding: 'text', bodySize: 12, bodyTruncated: false, durationMs: 4, journey: [] })
      }),
    )
    renderWithQuery(<ViewerInspector editable={false} />)
    await userEvent.clear(screen.getByLabelText('Path'))
    await userEvent.type(screen.getByLabelText('Path'), 'admin/')
    await userEvent.type(screen.getByLabelText('Request headers'), 'Authorization: Basic eDp5')
    await userEvent.click(screen.getByRole('button', { name: /Send/ }))
    await waitFor(() => expect(sent).toEqual({ method: 'GET', path: '/admin/', headers: { Authorization: 'Basic eDp5' } }))
    expect(await screen.findByText('401')).toBeInTheDocument()
    expect(screen.getByText('Unauthorized')).toBeInTheDocument()
    expect(useTrafficUI.getState().selectedId).toBe('abcd1234')
  })

  test('a 2.x setup edits the simulation for the session', async () => {
    let saved: unknown
    server.use(
      apiV2.get('/viewer/simulation', { source: 'session', requestHeaders: { 'X-A': '1' }, responseHeaders: {} }),
      http.put('*/api/v2/viewer/simulation', async ({ request }) => { saved = await request.json(); return new HttpResponse(null, { status: 204 }) }),
    )
    renderWithQuery(<ViewerInspector editable={false} />)
    expect(await screen.findByDisplayValue('X-A')).toBeInTheDocument()
    expect(screen.getByText('this session only')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Device/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'iPhone' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toBeDefined())
    expect(saved).toMatchObject({ requestHeaders: { 'X-A': '1', 'CloudFront-Is-Mobile-Viewer': 'true', 'CloudFront-Is-IOS-Viewer': 'true' }, responseHeaders: {} })
  })
})
