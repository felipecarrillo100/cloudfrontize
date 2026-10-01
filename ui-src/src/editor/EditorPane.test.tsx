import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import type { FunctionDetail } from '@contract'
import { apiV2, renderWithQuery, server } from '@/test/utils'
import { EditorPane } from './EditorPane'
import { EditorTabs } from './EditorTabs'
import { tabKey, useEditor, type EditorTab } from './store'

// Monaco can't run in jsdom: a textarea stands in for it (the editor's contract: value, onChange, onSave, problems)
vi.mock('./MonacoEditor', () => ({
  MonacoCodeEditor: (p: { value: string; onChange(v: string): void; onSave(): void; problems: { line: number | null }[] }) => (
    <div>
      <textarea aria-label="Code" value={p.value} onChange={e => p.onChange(e.target.value)} />
      <button type="button" onClick={p.onSave}>Ctrl+S</button>
      <span data-testid="markers">{p.problems.filter(x => x.line !== null).length}</span>
    </div>
  ),
  MonacoDiffView: (p: { original: string; modified: string }) => <div data-testid="diff"><pre>{p.original}</pre><pre>{p.modified}</pre></div>,
}))

const CODE = 'async function handler(event) { return event.request }\n'
const detail = (over: Partial<FunctionDetail> = {}): FunctionDetail => ({
  id: 'idx', type: 'cloudfront-function', runtime: 'cloudfront-js-2.0', file: 'functions/cloudfront/viewer-request.idx.js', path: '/p/i.js',
  attachments: [], disabled: false, size: CODE.length, build: { status: 'ok' }, source: { content: CODE, revision: 'r1' }, ...over,
})

const fnTab: EditorTab = { key: tabKey('function', 'idx'), kind: 'function', id: 'idx' }

function open(tab: EditorTab) {
  useEditor.getState().open(tab.kind, tab.id)
  return renderWithQuery(<><EditorPane tab={tab} /><Toaster /></>)
}

const code = () => screen.findByRole('textbox', { name: 'Code' })

describe('EditorPane', () => {
  beforeEach(() => useEditor.getState().reset())

  test('opens a function, tracks unsaved changes, and saves with the revision it edited', async () => {
    let body: unknown
    server.use(
      apiV2.get('/functions/idx', detail()),
      http.put('*/api/v2/functions/idx/source', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ revision: 'r2', build: { status: 'ok', checkedBy: 'runtime', size: 60, sizeLimit: 10240, errors: [], warnings: [] } })
      }),
    )
    open(fnTab)
    expect(await code()).toHaveValue(CODE)
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText(/\/ 10 KB/)).toBeInTheDocument()

    await userEvent.type(await code(), '// x')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ctrl+S' }))
    await waitFor(() => expect(body).toEqual({ content: CODE + '// x', revision: 'r1' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(useEditor.getState().buffers[fnTab.key].revision).toBe('r2')
  })

  test('build errors from a save become problems at their lines', async () => {
    server.use(
      apiV2.get('/functions/idx', detail()),
      http.put('*/api/v2/functions/idx/source', () => HttpResponse.json({
        revision: 'r2',
        build: { status: 'error', checkedBy: 'runtime', size: 60, sizeLimit: 10240, errors: [{ message: 'Unexpected token', line: 3, column: 5 }], warnings: [{ message: 'class is not in the runtime 2.0 feature list', line: 1 }] },
      })),
    )
    open(fnTab)
    await userEvent.type(await code(), 'oops(')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Unexpected token')).toBeInTheDocument()
    expect(screen.getByText('line 3')).toBeInTheDocument()
    expect(screen.getByText('class is not in the runtime 2.0 feature list')).toBeInTheDocument()
    expect(screen.getByTestId('markers')).toHaveTextContent('2')
    expect(await screen.findByText(/Saved, but it doesn't build/)).toBeInTheDocument()
  })

  test('a save that hits a newer version on disk shows both, and lets you choose', async () => {
    const saves: unknown[] = []
    server.use(
      apiV2.get('/functions/idx', detail()),
      http.put('*/api/v2/functions/idx/source', async ({ request }) => {
        const b = await request.json() as { revision: string }
        saves.push(b)
        if (b.revision === 'r1') return HttpResponse.json({ error: { code: 'conflict', message: 'changed', details: { revision: 'r9', content: 'ON DISK' } } }, { status: 409 })
        return HttpResponse.json({ revision: 'r10', build: { status: 'ok', checkedBy: 'static', size: 1, sizeLimit: 10240, errors: [], warnings: [] } })
      }),
    )
    open(fnTab)
    await userEvent.type(await code(), 'MINE')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const diff = await screen.findByTestId('diff')
    expect(diff).toHaveTextContent('ON DISK')
    expect(diff).toHaveTextContent('MINE')

    await userEvent.click(screen.getByRole('button', { name: 'Keep my version' }))
    await waitFor(() => expect(saves).toHaveLength(2))
    expect(saves[1]).toMatchObject({ revision: 'r9' })
    expect(await code()).toHaveValue(CODE + 'MINE')
  })

  test('"Use the disk version" discards your edit', async () => {
    server.use(
      apiV2.get('/functions/idx', detail()),
      http.put('*/api/v2/functions/idx/source', () => HttpResponse.json({ error: { code: 'conflict', message: 'changed', details: { revision: 'r9', content: 'ON DISK' } } }, { status: 409 })),
    )
    open(fnTab)
    await userEvent.type(await code(), 'MINE')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Use the disk version' }))
    expect(await code()).toHaveValue('ON DISK')
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  test('a change on disk is followed when nothing is unsaved, and announced when something is', async () => {
    server.use(apiV2.get('/functions/idx', detail()))
    const { client } = open(fnTab)
    await code()
    act(() => client.setQueryData(['function', 'idx'], detail({ source: { content: 'EDITED ELSEWHERE', revision: 'r2' } })))
    expect(await code()).toHaveValue('EDITED ELSEWHERE')

    await userEvent.type(await code(), '!')
    act(() => client.setQueryData(['function', 'idx'], detail({ source: { content: 'AGAIN', revision: 'r3' } })))
    expect(await screen.findByText(/changed on disk while you were editing/)).toBeInTheDocument()
    expect(await code()).toHaveValue('EDITED ELSEWHERE!')
  })

  test('the manifest: invalid JSON isn\'t sent; AWS rule errors are placed on their field', async () => {
    const manifest = { version: 1, name: 'shop', origins: [{ id: 'web', type: 'local', path: 'origins/www' }], defaultBehavior: { origin: 'web' } }
    let puts = 0
    server.use(
      apiV2.get('/project', { name: 'shop', dir: '/p', manifestPath: '/p/cloudfrontize.json', revision: 'm1', manifest, diagnostics: [] }),
      http.put('*/api/v2/project/manifest', () => {
        puts++
        return HttpResponse.json({ error: { code: 'invalid-manifest', message: 'The manifest has errors', details: { diagnostics: [{ severity: 'error', path: '/defaultBehavior/origin', rule: 'unknown-origin', message: 'No origin with id "nope"' }] } } }, { status: 422 })
      }),
    )
    open({ key: 'manifest', kind: 'manifest', id: 'manifest' })
    const editor = await code()
    await userEvent.clear(editor)
    await userEvent.type(editor, '{{"broken": ')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument()
    expect(puts).toBe(0)

    await userEvent.clear(editor)
    await userEvent.type(editor, JSON.stringify({ ...manifest, defaultBehavior: { origin: 'nope' } }, null, 2).replace(/[{[]/g, c => c + c))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('No origin with id "nope"')).toBeInTheDocument()
    expect(puts).toBe(1)
    expect(screen.getByText(/^line \d+$/)).toBeInTheDocument()
  })

  test('a key value store AWS wouldn\'t import is refused with its problems', async () => {
    server.use(
      apiV2.get('/kvs/redirects', { id: 'redirects', file: 'kvs/redirects.json', path: '/p/kvs/redirects.json', keyCount: 0, size: 14, usedBy: [], problems: [], source: { content: '{"data": []}', revision: 'k1' } }),
      http.put('*/api/v2/kvs/redirects', () => HttpResponse.json({ error: { code: 'invalid-kvs', message: 'bad', details: { problems: [{ severity: 'error', message: 'Key "/a" appears twice' }] } } }, { status: 422 })),
    )
    open({ key: tabKey('kvs', 'redirects'), kind: 'kvs', id: 'redirects' })
    await userEvent.type(await code(), ' ')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Key "/a" appears twice')).toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })
})

describe('EditorTabs', () => {
  beforeEach(() => useEditor.getState().reset())

  test('closing a tab with unsaved changes asks first', async () => {
    useEditor.getState().open('function', 'idx')
    useEditor.getState().load(fnTab.key, 'a', 'r1')
    useEditor.getState().edit(fnTab.key, 'ab')
    renderWithQuery(<EditorTabs />)
    expect(screen.getByLabelText('unsaved changes')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close idx' }))
    expect(await screen.findByRole('dialog', { name: 'Close idx?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(useEditor.getState().tabs).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Close idx' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))
    expect(useEditor.getState().tabs).toHaveLength(0)
    expect(useEditor.getState().active).toBeNull()
  })

  test('renaming a function moves its tab and unsaved buffer', () => {
    useEditor.getState().open('function', 'idx')
    useEditor.getState().load(fnTab.key, 'a', 'r1')
    useEditor.getState().edit(fnTab.key, 'changed')
    useEditor.getState().renameFunction('idx', 'index')
    const s = useEditor.getState()
    expect(s.tabs).toEqual([{ key: 'function:index', kind: 'function', id: 'index' }])
    expect(s.active).toBe('function:index')
    expect(s.buffers['function:index'].content).toBe('changed')
  })
})
