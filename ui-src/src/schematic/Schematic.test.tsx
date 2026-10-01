import { beforeEach, describe, expect, test } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Distribution } from '@contract'
import { apiV2, renderWithQuery, server } from '@/test/utils'
import { DialogHost } from '@/screens/DialogHost'
import { useUI } from '@/state/ui'
import { Schematic } from './Schematic'

const dist: Distribution = {
  mode: 'project',
  project: { name: 'Shop', dir: '/p', revision: 'r1' },
  functions: [
    { id: 'headers', type: 'lambda-edge', runtime: 'nodejs22.x', file: 'functions/lambda-edge/viewer-response.headers.js', path: '/p/h.js', disabled: false, build: { status: 'ok' } },
    { id: 'router', type: 'lambda-edge', runtime: 'nodejs22.x', file: 'functions/lambda-edge/origin-request.router.js', path: '/p/r.js', disabled: false, build: { status: 'unused' } },
    { id: 'idx', type: 'cloudfront-function', runtime: 'cloudfront-js-2.0', file: 'functions/cloudfront/viewer-request.idx.js', path: '/p/i.js', disabled: false, build: { status: 'unused' } },
  ],
  behaviors: [
    { key: '/api/*', pathPattern: '/api/*', origin: 'web', functions: {} },
    { key: 'default', pathPattern: null, origin: 'web', functions: { 'viewer-response': 'headers' } },
  ],
  origins: [{ id: 'web', type: 'local', path: 'origins/www' }],
}

function renderSchematic(editable = true, d = dist) {
  return renderWithQuery(<><Schematic dist={d} editable={editable} /><DialogHost dist={d} /></>)
}

describe('Schematic', () => {
  beforeEach(() => useUI.setState({ behaviorKey: 'default', selection: null }))

  test('shows each behavior as a tab and its functions in their slots', async () => {
    renderSchematic()
    expect(screen.getByRole('tab', { name: /\/api\/\*/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Default/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Lambda@Edge function headers on viewer-response' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Add function/ })).toHaveLength(3)
  })

  test('a slot offers only what AWS allows, and says why', async () => {
    renderSchematic()
    // viewer-request: viewer-response already runs Lambda@Edge, so a CloudFront Function would mix kinds
    await userEvent.click(screen.getByRole('button', { name: 'Add function to viewer-request' }))
    const cff = await screen.findByRole('menuitem', { name: /New CloudFront Function/ })
    expect(cff).toHaveAttribute('aria-disabled', 'true')
    expect(cff).toHaveTextContent("AWS doesn't allow both kinds")
    expect(screen.getByRole('menuitem', { name: /New Lambda@Edge function/ })).not.toHaveAttribute('aria-disabled')
    await userEvent.keyboard('{Escape}')

    await userEvent.click(screen.getByRole('button', { name: 'Add function to origin-request' }))
    expect(await screen.findByRole('menuitem', { name: /New CloudFront Function/ })).toHaveTextContent('CloudFront Functions run only on viewer events')
  })

  test('creating a function from a slot sends its type, event and behavior', async () => {
    let body: unknown
    server.use(
      http.post('*/api/v2/functions', async ({ request }) => { body = await request.json(); return HttpResponse.json({ function: {} }, { status: 201 }) }),
      apiV2.get('/project', {}), apiV2.get('/distribution', dist),
    )
    useUI.setState({ behaviorKey: '/api/*' })
    renderSchematic()
    await userEvent.click(screen.getByRole('button', { name: 'Add function to origin-request' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /New Lambda@Edge function/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New Lambda@Edge function' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'auth')
    expect(within(dialog).getByText('functions/lambda-edge/origin-request.auth.js')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(body).toEqual({ type: 'lambda-edge', event: 'origin-request', behavior: '/api/*', id: 'auth', runtime: 'nodejs22.x' }))
    await waitFor(() => expect(useUI.getState().selection).toEqual({ kind: 'function', id: 'auth' }))
  })

  test('an existing function can be attached to a slot', async () => {
    let path = ''
    let body: unknown
    server.use(
      http.put('*/api/v2/behaviors/:behavior/functions/:event', async ({ request, params }) => { path = `${params.behavior}|${params.event}`; body = await request.json(); return HttpResponse.json({}) }),
      apiV2.get('/project', {}), apiV2.get('/distribution', dist),
    )
    useUI.setState({ behaviorKey: '/api/*' })
    renderSchematic()
    await userEvent.click(screen.getByRole('button', { name: 'Add function to origin-request' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Use an existing function/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /router/ }))
    await waitFor(() => expect(path).toBe('/api/*|origin-request'))
    expect(body).toEqual({ function: 'router' })
  })

  test('a function\'s menu disables it for testing', async () => {
    let control: unknown
    server.use(http.post('*/api/v2/controls', async ({ request }) => { control = await request.json(); return HttpResponse.json(dist) }))
    renderSchematic()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for headers' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Disable for testing/ }))
    await waitFor(() => expect(control).toEqual({ action: 'disable', function: 'headers' }))
  })

  test('2.x setups are read-only', () => {
    renderSchematic(false, { ...dist, mode: 'legacy', project: null })
    expect(screen.queryByRole('button', { name: /Add function/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add behavior/ })).not.toBeInTheDocument()
    expect(screen.getAllByText('No function')).toHaveLength(3)
  })

  test('clicking a node selects it for the inspector', async () => {
    renderSchematic()
    await userEvent.click(screen.getByRole('button', { name: /Origin/ }))
    expect(useUI.getState().selection).toEqual({ kind: 'origin' })
  })
})
