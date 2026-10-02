import { beforeEach, describe, expect, test } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import type { Distribution, ProjectInfo } from '@contract'
import { apiV2, renderWithQuery, server } from '@/test/utils'
import { useUI } from '@/state/ui'
import { DistributionInspector } from './DistributionInspector'
import { FunctionInspector } from './FunctionInspector'
import { OriginInspector } from './OriginInspector'
import { ViewerInspector } from './ViewerInspector'

const manifest = {
  version: 1, name: 'Shop',
  origins: [{ id: 'web', type: 'local', path: 'origins/www' }, { id: 'media', type: 's3', bucket: 'media-bucket', credentials: { profile: 'dev' } }],
  functions: { idx: { type: 'cloudfront-function', file: 'functions/cloudfront/viewer-request.idx.js' } },
  keyValueStores: { redirects: { file: 'kvs/redirects.json' } },
  defaultBehavior: { origin: 'web', functions: { 'viewer-request': 'idx' } },
  behaviors: [{ pathPattern: '/a/*', origin: 'web' }, { pathPattern: '/b/*', origin: 'media' }],
}
const project: ProjectInfo = { name: 'Shop', dir: '/p', manifestPath: '/p/cloudfrontize.json', revision: 'rev-1', manifest, settings: [], diagnostics: [] }
const dist: Distribution = {
  mode: 'project', project: { name: 'Shop', dir: '/p', revision: 'rev-1' },
  functions: [{ id: 'idx', type: 'cloudfront-function', runtime: 'cloudfront-js-2.0', file: 'functions/cloudfront/viewer-request.idx.js', path: '/p/i.js', disabled: false, build: { status: 'ok' } }],
  behaviors: [
    { key: '/a/*', pathPattern: '/a/*', origin: 'web', functions: {} },
    { key: '/b/*', pathPattern: '/b/*', origin: 'media', functions: {} },
    { key: 'default', pathPattern: null, origin: 'web', functions: { 'viewer-request': 'idx' } },
  ],
  origins: [{ id: 'web', type: 'local', path: 'origins/www' }, { id: 'media', type: 's3', bucket: 'media-bucket', credentials: { configured: true } }],
}

/** Captures manifest saves; answers 409 when `conflict` is set. */
function captureSaves(conflict = false) {
  const saves: { manifest: typeof manifest & { distribution?: Record<string, unknown> }; revision: string }[] = []
  server.use(
    apiV2.get('/project', project), apiV2.get('/distribution', dist),
    http.put('*/api/v2/project/manifest', async ({ request }) => {
      saves.push(await request.json() as typeof saves[number])
      return conflict
        ? HttpResponse.json({ error: { code: 'conflict', message: 'changed', details: { revision: 'rev-2' } } }, { status: 409 })
        : HttpResponse.json({ revision: 'rev-2', diagnostics: [] })
    }),
  )
  return saves
}

describe('inspectors', () => {
  beforeEach(() => useUI.setState({ behaviorKey: 'default', selection: null }))

  test('distribution settings save the manifest with the revision they edited', async () => {
    const saves = captureSaves()
    renderWithQuery(<DistributionInspector dist={dist} editable />)
    await userEvent.click(await screen.findByRole('checkbox', { name: /Strict mode/ }))
    await waitFor(() => expect(saves).toHaveLength(1))
    expect(saves[0].revision).toBe('rev-1')
    expect(saves[0].manifest.distribution).toEqual({ strict: true })
    // Nothing else in the manifest was touched
    expect({ ...saves[0].manifest, distribution: undefined }).toEqual({ ...manifest, distribution: undefined })
  })

  test('settings changed with --set are listed, and the checkboxes show the file', async () => {
    server.use(apiV2.get('/project', { ...project, settings: ['distribution.strict=true'] }), apiV2.get('/distribution', dist))
    renderWithQuery(<DistributionInspector dist={dist} editable />)
    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent('distribution.strict=true')
    expect(screen.getByRole('checkbox', { name: /Strict mode/ })).not.toBeChecked()
  })

  test('behaviors can be reordered (match order matters)', async () => {
    const saves = captureSaves()
    renderWithQuery(<DistributionInspector dist={dist} editable />)
    await userEvent.click(await screen.findByRole('button', { name: 'Move /b/* up' }))
    await waitFor(() => expect(saves).toHaveLength(1))
    expect(saves[0].manifest.behaviors.map(b => b.pathPattern)).toEqual(['/b/*', '/a/*'])
  })

  test('a save that hits a newer version on disk says so instead of overwriting it', async () => {
    captureSaves(true)
    renderWithQuery(<><DistributionInspector dist={dist} editable /><Toaster /></>)
    await userEvent.click(await screen.findByRole('checkbox', { name: /CORS/ }))
    expect(await screen.findByText(/The project changed meanwhile/)).toBeInTheDocument()
  })

  test('the origin inspector changes the behavior\'s origin and tests connections', async () => {
    const saves = captureSaves()
    server.use(http.post('*/api/v2/origins/web/check', () => HttpResponse.json({ ok: true, message: '/p/origins/www (3 entries)' })))
    renderWithQuery(<OriginInspector dist={dist} editable />)
    await userEvent.selectOptions(await screen.findByLabelText('Origin for this behavior'), 'media')
    await waitFor(() => expect(saves).toHaveLength(1))
    expect(saves[0].manifest.defaultBehavior.origin).toBe('media')

    await userEvent.click(screen.getByRole('button', { name: /Test connection/ }))
    expect(await screen.findByText('/p/origins/www (3 entries)')).toBeInTheDocument()
  })

  test('an origin in use can\'t be deleted', async () => {
    captureSaves()
    renderWithQuery(<OriginInspector dist={dist} editable />)
    expect(await screen.findByRole('button', { name: /Delete/ })).toBeDisabled()
    expect(screen.getByText(/Used by Default \(\*\), \/a\/\*/)).toBeInTheDocument()
  })

  test('the viewer inspector applies presets with real CloudFront header names and saves the file', async () => {
    let saved: { content: string; revision: string | null } | undefined
    server.use(
      apiV2.get('/viewer/headers', { file: null, content: null, revision: null }),
      apiV2.get('/project', project), apiV2.get('/distribution', dist),
      http.put('*/api/v2/viewer/headers', async ({ request }) => { saved = await request.json() as typeof saved; return HttpResponse.json({ file: 'config/headers.json', revision: 'h1' }) }),
    )
    renderWithQuery(<ViewerInspector editable />)
    await userEvent.click(await screen.findByRole('button', { name: /Location/ }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'FR · Paris' }))
    expect(screen.getAllByText('CloudFront adds this').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toBeDefined())
    expect(saved!.revision).toBeNull()
    expect(JSON.parse(saved!.content)).toMatchObject({ 'CloudFront-Viewer-Country': 'FR', 'CloudFront-Viewer-City': 'Paris', 'CloudFront-Viewer-Time-Zone': 'Europe/Paris' })
  })

  test('the function inspector changes the runtime, and key value stores need runtime 2.0', async () => {
    let patch: unknown
    server.use(
      apiV2.get('/project', project), apiV2.get('/distribution', dist),
      apiV2.get('/functions/idx', { id: 'idx', type: 'cloudfront-function', runtime: 'cloudfront-js-1.0', file: 'f', path: '/p/i.js', attachments: [{ behavior: 'default', event: 'viewer-request' }], disabled: false, size: 2048, build: { status: 'ok' }, source: null }),
      http.patch('*/api/v2/functions/idx', async ({ request }) => { patch = await request.json(); return HttpResponse.json({ function: {} }) }),
    )
    renderWithQuery(<FunctionInspector fn={dist.functions[0]} editable />)
    expect(await screen.findByText('2.0 KB of 10 KB')).toBeInTheDocument()
    expect(screen.getByLabelText(/Key value store/)).toBeDisabled()
    expect(screen.getByText('Key value stores need runtime 2.0.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText(/Runtime/), 'cloudfront-js-2.0')
    await waitFor(() => expect(patch).toEqual({ runtime: 'cloudfront-js-2.0' }))
  })
})
