import { describe, expect, test, vi } from 'vitest'
import { useState } from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { apiV2, renderWithQuery, server } from '@/test/utils'
import type { FolderListing } from '@contract'
import { FolderBrowser } from './FolderBrowser'

const folders: Record<string, FolderListing> = {
  '/home/me': { path: '/home/me', parent: null, isProject: false, roots: ['/home/me'], truncated: false, entries: [
    { name: 'shop', path: '/home/me/shop', isProject: true, hidden: false },
    { name: 'work', path: '/home/me/work', isProject: false, hidden: false },
  ] },
  '/home/me/shop': { path: '/home/me/shop', parent: '/home/me', isProject: true, roots: ['/home/me'], truncated: false, entries: [] },
  '/home/me/work': { path: '/home/me/work', parent: '/home/me', isProject: false, roots: ['/home/me'], truncated: false, entries: [] },
}

function Harness({ onChooseProject }: { onChooseProject(p: string): void }) {
  const [path, setPath] = useState<string | null>(null)
  return <FolderBrowser path={path} onNavigate={setPath} onChooseProject={onChooseProject} />
}

describe('FolderBrowser', () => {
  test('lists folders, marks projects, navigates and goes up', async () => {
    server.use(http.get('*/api/v2/fs/list', ({ request }) => HttpResponse.json(folders[new URL(request.url).searchParams.get('path') ?? '/home/me'])))
    const onChooseProject = vi.fn()
    renderWithQuery(<Harness onChooseProject={onChooseProject} />)

    await userEvent.click(await screen.findByRole('button', { name: 'work' }))
    expect(await screen.findByText('No folders here')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Parent folder' }))

    // A double-click on a project chooses it
    await userEvent.dblClick(await screen.findByRole('button', { name: 'shop (project)' }))
    expect(onChooseProject).toHaveBeenCalledWith('/home/me/shop')
  })

  test('shows why a folder can\'t be browsed', async () => {
    server.use(apiV2.error('get', '/fs/list', 403, 'outside-roots', 'Only folders inside your home folder can be browsed'))
    renderWithQuery(<FolderBrowser path="/etc" onNavigate={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Only folders inside your home folder')
  })
})
