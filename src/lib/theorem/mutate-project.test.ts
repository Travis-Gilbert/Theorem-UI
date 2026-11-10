// The projects list's real page shape (ProjectPage, cursor-paged), served in-process.
import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test'
import { mutateProject } from './client'

const project = (projectId: string, revision: number) => ({
  schema: 'theorem.chat.project.v1',
  projectId,
  tenantId: 't',
  title: projectId,
  instructions: '',
  status: 'active',
  revision,
  createdAtMs: 1,
  updatedAtMs: 1,
})

const listed: URL[] = []
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
    const url = new URL(new Request(input, init).url)
    if (url.pathname.endsWith('/bootstrap'))
      return Response.json({ csrfToken: 'csrf', tenantId: 't' })
    listed.push(url)
    // A hundred sections fill the first page; the one edited is on the second.
    return url.searchParams.get('cursor') === 'second'
      ? Response.json({ items: [project('proj_late', 7)] })
      : Response.json({
          items: Array.from({ length: 100 }, (_, i) => project(`proj_${i}`, 1)),
          nextCursor: 'second',
        })
  }) as typeof fetch)
})
afterAll(() => {
  fetchSpy.mockRestore()
  page.setURL('about:blank')
})

test('a section past the first page of projects is still found and edited at its revision', async () => {
  const sent = await mutateProject(
    'proj_late',
    async (headers) => headers['If-Match'],
  )
  expect(sent).toBe('7')
  expect(listed.map((url) => url.searchParams.get('cursor'))).toEqual([
    null,
    'second',
  ])
})
