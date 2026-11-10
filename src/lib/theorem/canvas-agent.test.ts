// Real SDK request bodies with an in-process HTTP fixture; no hosted backend is running.
import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from 'bun:test'
import { noteSource } from '@/components/notes/note-panel'
import type { Note } from './notes'
import { askOnCanvas } from './canvas-agent'

let requests: Array<{ path: string; body: Record<string, unknown> }> = []
let refusal = false
const note = (overrides: Partial<Note> = {}): Note => ({
  documentId: 'note-42',
  title: 'Evidence',
  markdown: 'Saved paragraph.',
  savedMarkdown: 'Saved paragraph.',
  revision: { position: 17, contentDigest: 'digest' },
  canonical: undefined,
  editable: true,
  origin: {
    kind: 'user_authored',
    actorId: 'person:test',
    originSurface: 'test',
  },
  retired: false,
  ...overrides,
})
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
    const path = new URL(request.url).pathname
    if (path.endsWith('/bootstrap'))
      return Response.json({ csrfToken: 'csrf', tenantId: 't' })
    if (path.endsWith('/events'))
      return new Response(
        'data: {"seq":1,"sourceEventType":"RUN.CLOSED","payload":{}}\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      )
    const body = (await request.json()) as Record<string, unknown>
    requests.push({ path, body })
    if (path.endsWith('/threads'))
      return Response.json({
        record: {
          threadId: 'thread-1',
          selectedBranchId: 'branch-1',
          revision: 1,
        },
      })
    if (refusal)
      return Response.json(
        {
          code: 'context_revision_mismatch',
          detail:
            'The selected document has changed. Refresh the selection and send again.',
        },
        { status: 412 },
      )
    return Response.json({ run: { runId: 'run-1' } })
  }) as typeof fetch)
})
afterAll(() => {
  fetchSpy.mockRestore()
  page.setURL('about:blank')
})
beforeEach(() => {
  requests = []
  refusal = false
})

const send = async (sources: ReturnType<typeof noteSource>[]) => {
  for await (const _update of askOnCanvas({
    projectId: 'project-1',
    spaceId: 'space-1',
    prompt: 'Explain',
    sources,
    signal: new AbortController().signal,
  })) {
    /* consume the real SDK stream */
  }
}

test('a whole unplaced note carries its saved revision as canonical context', async () => {
  const source = noteSource(note(), undefined, undefined)
  expect(source.revision).toEqual({ position: 17, contentDigest: 'digest' })
  await send([source])
  expect(requests.at(-1)?.body).toMatchObject({
    text: 'Explain',
    contextReferences: [
      {
        location: {
          resource: { kind: 'graph-object', objectId: 'note-42' },
          revision: '17',
        },
        label: 'Evidence',
      },
    ],
  })
  expect(requests.at(-1)?.body.spaceContext).toBeUndefined()
})

test('a placed selection preserves its Space locator alongside canonical context', async () => {
  const original = note()
  const source = noteSource(original, 'placement-1', 'paragraph')
  original.revision.position = 18
  await send([source])
  expect(requests.at(-1)?.body).toMatchObject({
    contextReferences: [
      {
        location: {
          resource: { kind: 'graph-object', objectId: 'note-42' },
          revision: '17',
        },
        excerpt: 'paragraph',
      },
    ],
    spaceContext: {
      space: 'space-1',
      selected: [{ kind: 'document', id: 'note-42' }],
      locators: [
        {
          revision: '17',
          placement: 'placement-1',
          at: { text_range: { start: 6, end: 15, quote: 'paragraph' } },
        },
      ],
    },
  })
})

test('unsaved selected source text is refused before creating a conversation', async () => {
  const source = noteSource(
    note({ markdown: 'Unsaved paragraph.' }),
    undefined,
    'paragraph',
  )
  await expect(send([source])).rejects.toThrow('Save or refresh')
  expect(requests).toHaveLength(0)
})

test('a canonical revision refusal is preserved instead of retrying against newer text', async () => {
  refusal = true
  await expect(
    send([noteSource(note(), undefined, undefined)]),
  ).rejects.toMatchObject({
    statusCode: 412,
    body: { code: 'context_revision_mismatch' },
  })
  expect(
    requests.filter((request) => request.path.endsWith('/messages')),
  ).toHaveLength(1)
})

test('a rendered selection without a literal Markdown range remains an annotation on its pinned note', async () => {
  const source = noteSource(
    note({
      markdown: '**Saved** paragraph.',
      savedMarkdown: '**Saved** paragraph.',
    }),
    'placement-1',
    'Saved paragraph',
  )
  await send([source])
  expect(requests.at(-1)?.body.contextReferences).toMatchObject([
    { excerpt: 'Saved paragraph', location: { revision: '17' } },
  ])
  expect(
    (requests.at(-1)?.body.spaceContext as Record<string, unknown>).locators,
  ).toBeUndefined()
})

test('an ordinary canvas question sends no document references', async () => {
  await send([])
  expect(requests.at(-1)?.body.text).toBe('Explain')
  expect(requests.at(-1)?.body.contextReferences).toBeUndefined()
})

test('mixed whole notes and passages retain each canonical source and only valid Space locators', async () => {
  await send([
    noteSource(note(), 'placement-1', undefined),
    noteSource(note({ documentId: 'note-43' }), 'placement-2', 'paragraph'),
  ])
  const body = requests.at(-1)!.body
  expect(body.contextReferences).toMatchObject([
    { location: { resource: { objectId: 'note-42' }, revision: '17' } },
    { location: { resource: { objectId: 'note-43' }, revision: '17' } },
  ])
  expect(body.spaceContext).toMatchObject({
    selected: [{ id: 'note-42' }, { id: 'note-43' }],
    locators: [{ object: { id: 'note-43' }, placement: 'placement-2' }],
  })
})
