// The uploads route's real response shape, served in-process; no hosted backend is running.
import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from 'bun:test'
import { isLearning, uploadFile } from './imports'
import type { ImportRecord } from './imports'

let uploads: Request[] = []
let uploadReply: () => Response
const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
let fetchSpy: ReturnType<typeof spyOn>
beforeAll(() => {
  page.setURL('http://localhost:3000/')
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path.endsWith('/bootstrap'))
      return Response.json({ csrfToken: 'csrf', tenantId: 't' })
    uploads.push(request)
    return uploadReply()
  }) as typeof fetch)
})
afterAll(() => {
  fetchSpy.mockRestore()
  page.setURL('about:blank')
})
beforeEach(() => {
  uploads = []
  // `{ record: ChatUpload }`, as rustyred-thg-server's uploads route answers.
  uploadReply = () =>
    Response.json(
      { record: { uploadId: 'upl_7', projectId: 'proj_1', state: 'ready' } },
      { status: 201 },
    )
})

test('a file goes through the project uploads route and yields its upload id', async () => {
  const file = new File(['hello'], 'notes.md', { type: 'text/markdown' })
  expect(await uploadFile('proj_1', file)).toBe('upl_7')
  expect(uploads).toHaveLength(1)
  const [sent] = uploads
  expect(new URL(sent!.url).pathname).toBe('/api/chat/v1/projects/proj_1/uploads')
  expect(sent!.headers.get('x-file-size')).toBe('5')
  expect(sent!.headers.get('x-content-sha256')).toBe(
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  )
  expect(sent!.headers.get('X-CSRF-Token')).toBe('csrf')
})

test('an upload answer without an upload id is an error, not an import of nothing', async () => {
  uploadReply = () => Response.json({ uploadId: 'top-level-is-not-the-shape' }, { status: 201 })
  const file = new File(['hello'], 'notes.md', { type: 'text/markdown' })
  await expect(uploadFile('proj_1', file)).rejects.toThrow('Upload of notes.md answered 201')
})

test('a ready import still being read for the UserModel keeps the list polling', () => {
  const record = (userModel?: ImportRecord['userModel']): ImportRecord => ({
    importId: 'imp_1',
    projectId: 'proj_1',
    kind: 'text',
    title: 'Notes',
    status: 'ready',
    userModel,
    createdAtMs: 1,
    updatedAtMs: 2,
  })
  expect(isLearning(record({ state: 'pending', applied: 0, held: 0, rejected: 0 }))).toBe(true)
  expect(isLearning(record({ state: 'applied', applied: 1, held: 0, rejected: 0 }))).toBe(false)
  expect(isLearning(record(undefined))).toBe(false)
})
