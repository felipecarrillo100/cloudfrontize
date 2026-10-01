import { describe, expect, test } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/utils'
import { api, ApiRequestError } from './client'

describe('api client', () => {
  test('a POST always goes out as JSON, even without a body (the API refuses anything else)', async () => {
    let contentType: string | null = null
    server.use(http.post('*/api/v2/project/reload', ({ request }) => {
      contentType = request.headers.get('content-type')
      return HttpResponse.json({ ok: true })
    }))
    await expect(api('POST', '/project/reload')).resolves.toEqual({ ok: true })
    expect(contentType).toBe('application/json')
  })

  test('errors carry the status, code, message and diagnostics', async () => {
    const diagnostics = [{ severity: 'error', path: '/origins', rule: 'schema', message: 'Add at least one origin' }]
    server.use(http.put('*/api/v2/project/manifest', () =>
      HttpResponse.json({ error: { code: 'invalid-manifest', message: 'The manifest has errors', details: { diagnostics } } }, { status: 422 })))
    const err = await api<unknown>('PUT', '/project/manifest', {}).then(() => null, (e: ApiRequestError) => e)
    expect(err).toBeInstanceOf(ApiRequestError)
    expect(err).toMatchObject({ status: 422, code: 'invalid-manifest', message: 'The manifest has errors' })
    expect(err?.diagnostics).toEqual(diagnostics)
  })

  test('204 resolves to undefined; a dead server is an "offline" error', async () => {
    server.use(http.delete('*/api/v2/requests', () => new HttpResponse(null, { status: 204 })))
    await expect(api('DELETE', '/requests')).resolves.toBeUndefined()
    server.use(http.get('*/api/v2', () => HttpResponse.error()))
    await expect(api('GET', '')).rejects.toMatchObject({ code: 'offline' })
  })
})
