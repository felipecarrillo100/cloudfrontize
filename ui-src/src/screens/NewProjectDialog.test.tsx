import { describe, expect, test, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { apiV2, renderWithQuery, server } from '@/test/utils'
import { NewProjectDialog } from './NewProjectDialog'

const listing = { path: '/home/me', parent: null, isProject: false, entries: [], truncated: false, roots: ['/home/me'] }

function setup() {
  const onCreated = vi.fn()
  server.use(apiV2.get('/fs/list', listing), apiV2.get('/templates', { items: [
    { id: 'empty', name: 'Empty', description: 'One origin', order: 0 },
    { id: 'spa', name: 'Single-page app', description: 'Routes without an extension get index.html', order: 1 },
    { id: 's3-origin', name: 'S3 origin (MinIO)', description: 'From a bucket', order: 7, requires: 'Docker (MinIO)' },
  ] }))
  renderWithQuery(<NewProjectDialog open onOpenChange={() => {}} onCreated={onCreated} />)
  return { onCreated }
}

describe('NewProjectDialog', () => {
  test('the folder name follows the project name; the project is created where chosen', async () => {
    let body: { dir?: string; name?: string; origin?: unknown } | undefined
    server.use(http.post('*/api/v2/projects', async ({ request }) => { body = await request.json() as typeof body; return HttpResponse.json({ dir: '/home/me/my-shop' }, { status: 201 }) }))
    const { onCreated } = setup()
    // Choose the location (the browser starts at the first root)
    await userEvent.click(await screen.findByRole('button', { name: '/home/me' }))
    await userEvent.type(screen.getByLabelText('Project name'), 'My Shop!')
    expect(screen.getByLabelText('Folder name')).toHaveValue('my-shop')
    expect(screen.getByText('/home/me/my-shop')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(body).toEqual({ dir: '/home/me/my-shop', name: 'My Shop!' })
  })

  test('an S3 origin needs a valid bucket, and is sent without credentials', async () => {
    let body: { dir?: string; name?: string; origin?: unknown } | undefined
    server.use(http.post('*/api/v2/projects', async ({ request }) => { body = await request.json() as typeof body; return HttpResponse.json({ dir: '/home/me/site' }, { status: 201 }) }))
    setup()
    await userEvent.click(await screen.findByRole('button', { name: '/home/me' }))
    await userEvent.type(screen.getByLabelText('Project name'), 'Site')
    await userEvent.click(screen.getByLabelText('S3 bucket'))
    await userEvent.type(screen.getByLabelText('Bucket'), 'Bad_Bucket')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText(/valid bucket name/)).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Bucket'))
    await userEvent.type(screen.getByLabelText('Bucket'), 'site-bucket')
    await userEvent.type(screen.getByLabelText('Endpoint'), 'http://localhost:9000')
    await userEvent.type(screen.getByLabelText('AWS profile'), 'dev')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(body).toBeDefined())
    expect(body?.origin).toEqual({ id: 'bucket', type: 's3', bucket: 'site-bucket', mode: 'rest', endpoint: 'http://localhost:9000', forcePathStyle: true, credentials: { profile: 'dev' } })
  })

  test('a template can be chosen; templates hide the origin choice and say what they need', async () => {
    let body: { template?: string; origin?: unknown } | undefined
    server.use(http.post('*/api/v2/projects', async ({ request }) => { body = await request.json() as typeof body; return HttpResponse.json({ dir: '/home/me/app' }, { status: 201 }) }))
    setup()
    await userEvent.click(await screen.findByRole('button', { name: '/home/me' }))
    await userEvent.type(screen.getByLabelText('Project name'), 'App')
    expect(screen.getByText('Needs Docker (MinIO)')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/Single-page app/))
    expect(screen.queryByLabelText('S3 bucket')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(body).toEqual({ dir: '/home/me/app', name: 'App', template: 'spa' }))
  })

  test('a folder that already has content is reported on the folder field', async () => {
    server.use(apiV2.error('post', '/projects', 409, 'conflict', '/home/me/site isn\'t empty'))
    setup()
    await userEvent.click(await screen.findByRole('button', { name: '/home/me' }))
    await userEvent.type(screen.getByLabelText('Project name'), 'Site')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText("/home/me/site isn't empty")).toBeInTheDocument()
    expect(screen.getByLabelText('Folder name')).toHaveAttribute('aria-invalid', 'true')
  })
})
