import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse, type JsonBodyType } from 'msw'

/** Renders with a fresh query client (no retries, so errors show at once). */
export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) }
}

export const server = setupServer()

/** An API v2 handler: `api.get('/projects/recent', body)`. */
export const apiV2 = {
  get: (path: string, body: JsonBodyType, status = 200) => http.get(`*/api/v2${path}`, () => HttpResponse.json(body, { status })),
  error: (method: 'get' | 'post' | 'put' | 'delete', path: string, status: number, code: string, message: string, details?: unknown) =>
    http[method](`*/api/v2${path}`, () => HttpResponse.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status })),
}
