import { describe, expect, test } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { apiV2, renderWithQuery, server } from '@/test/utils'
import { useUI } from '@/state/ui'
import { StartScreen } from './StartScreen'

const info = { apiVersion: 2, version: '3.0.0', ports: { main: 3000, webui: 3001 }, project: null, legacy: false, routes: [] }
const recent = [
  { dir: '/home/me/shop', name: 'Shop', openedAt: new Date().toISOString(), exists: true },
  { dir: '/home/me/gone', name: 'Gone', openedAt: new Date().toISOString(), exists: false },
]

describe('StartScreen', () => {
  test('lists recent projects; moved ones can\'t be opened', async () => {
    server.use(apiV2.get('', info), apiV2.get('/projects/recent', { items: recent }))
    renderWithQuery(<StartScreen />)
    expect(await screen.findByText('Shop')).toBeInTheDocument()
    expect(screen.getByText('/home/me/shop')).toBeInTheDocument()
    expect(screen.getByText('moved or deleted')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Gone' })).toBeDisabled()
  })

  test('opening a recent project asks the server and switches to the workbench', async () => {
    let opened: unknown
    server.use(
      apiV2.get('', info),
      apiV2.get('/projects/recent', { items: recent }),
      http.post('*/api/v2/projects/open', async ({ request }) => { opened = await request.json(); return HttpResponse.json({ name: 'Shop', dir: '/home/me/shop' }) }),
    )
    useUI.setState({ view: 'start' })
    renderWithQuery(<StartScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Open Shop' }))
    await waitFor(() => expect(useUI.getState().view).toBe('workbench'))
    expect(opened).toEqual({ path: '/home/me/shop' })
  })

  test('removing a project from the list', async () => {
    let removed: string | null = null
    server.use(
      apiV2.get('', info),
      apiV2.get('/projects/recent', { items: recent }),
      http.delete('*/api/v2/projects/recent', ({ request }) => { removed = new URL(request.url).searchParams.get('dir'); return new HttpResponse(null, { status: 204 }) }),
    )
    renderWithQuery(<StartScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Shop from recent projects' }))
    await waitFor(() => expect(removed).toBe('/home/me/shop'))
  })

  test('offers to go back to the open project', async () => {
    server.use(apiV2.get('', { ...info, project: { name: 'Shop', dir: '/home/me/shop' } }), apiV2.get('/projects/recent', { items: [] }))
    renderWithQuery(<StartScreen />)
    expect(await screen.findByRole('button', { name: /Back to Shop/ })).toBeInTheDocument()
    expect(screen.getByText('Projects you open appear here.')).toBeInTheDocument()
  })
})
