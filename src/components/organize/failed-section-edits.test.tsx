// A section edit the server refuses, against the real edits hook and a stubbed server.
import { afterAll, afterEach, beforeAll, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, click, render, waitFor } from '../../../test/blocks/render'
import { useProjectEdits } from '@/lib/theorem/organization'
import { FailedSectionEdits } from './sessions-panel'

const project = {
  schema: 'theorem.chat.project.v1',
  projectId: 'proj_a',
  tenantId: 't',
  title: 'Research',
  instructions: '',
  status: 'active',
  revision: 3,
  createdAtMs: 1,
  updatedAtMs: 1,
}

const updates: string[] = []
let refuse = true
const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
let fetchSpy: ReturnType<typeof spyOn>
beforeAll(() => {
  page.setURL('http://localhost:3000/')
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
    input,
    init,
  ) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.pathname.endsWith('/bootstrap'))
      return Response.json({ csrfToken: 'csrf', tenantId: 't' })
    if (request.method === 'GET') return Response.json({ items: [project] })
    updates.push(`${request.method} ${url.pathname}`)
    return refuse
      ? Response.json(
          { title: 'The chat store is unavailable.' },
          { status: 503 },
        )
      : Response.json({ project: { ...project, revision: 4 } })
  }) as typeof fetch)
})
afterEach(async () => {
  await cleanup()
})
afterAll(() => {
  fetchSpy.mockRestore()
  page.setURL('about:blank')
})

function Panel() {
  const edits = useProjectEdits()
  return (
    <>
      <button
        onClick={() =>
          edits.rename.mutate({ projectId: 'proj_a', title: 'Reading' })
        }
      >
        Rename
      </button>
      <FailedSectionEdits edits={edits} projects={[project]} />
    </>
  )
}

test('a refused section rename says why, and trying again sends it again', async () => {
  const client = new QueryClient()
  const { container } = await render(
    <QueryClientProvider client={client}>
      <Panel />
    </QueryClientProvider>,
  )
  const button = (name: string) =>
    [...container.querySelectorAll('button')].find(
      (item) => item.textContent.trim() === name,
    )
  await click(button('Rename')!)
  const alert = await waitFor(() => container.querySelector('[role="alert"]'))
  expect(alert.textContent).toContain('“Research” could not be renamed')
  expect(alert.textContent).toContain('The chat store is unavailable.')
  refuse = false
  await click(button('Try again')!)
  await waitFor(() =>
    container.querySelector('[role="alert"]') ? undefined : true,
  )
  expect(updates).toHaveLength(2)
})
