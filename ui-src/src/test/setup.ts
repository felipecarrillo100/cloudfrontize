import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './utils'

// jsdom has no matchMedia (theme detection and the toaster use it)
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }) as MediaQueryList
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => { cleanup(); server.resetHandlers() })
afterAll(() => server.close())
