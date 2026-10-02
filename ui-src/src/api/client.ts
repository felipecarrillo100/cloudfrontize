import type { ApiErrorBody, Diagnostic } from '@contract'

/** An error answered by the API: its HTTP status, stable `code`, message and details. */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** Manifest diagnostics carried by `invalid-manifest` errors. */
  get diagnostics(): Diagnostic[] {
    const d = this.details as { diagnostics?: Diagnostic[] } | undefined
    return Array.isArray(d?.diagnostics) ? d.diagnostics : []
  }
}

export const API_BASE = '/api/v2'

/**
 * Calls the WebUI API v2. Every request with a body (and every POST) is sent as JSON, which the API
 * requires; errors become an {@link ApiRequestError}.
 */
export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const withBody = body !== undefined || method === 'POST'
  let res: Response
  try {
    res = await fetch(new URL(API_BASE + path, window.location.href), {
      method,
      headers: withBody ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiRequestError(0, 'offline', "Can't reach CloudFrontize. Is it still running?")
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown
  try { data = text ? JSON.parse(text) : undefined } catch { data = undefined }
  if (!res.ok) {
    const error = (data as ApiErrorBody | undefined)?.error
    throw new ApiRequestError(res.status, error?.code ?? `http-${res.status}`, error?.message ?? (res.statusText || 'Request failed'), error?.details)
  }
  return data as T
}

/** A readable message for any error thrown by an API call. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}
