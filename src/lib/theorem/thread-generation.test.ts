// SOURCING: bun:test over the real SDK client and client.mutateThread, with window.fetch answered in process by stories/fake-theorem; no Theorem is running
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test'
import { installFakeTheorem } from '@/stories/fake-theorem'
import type { FakeRoutes } from '@/stories/fake-theorem'
import { generationTurnOptions, useGenerationDefaults, useGenerationOverrides } from './generation'
import { saveThreadGeneration, takeThreadGeneration } from './thread-generation'

const page = (window as unknown as { happyDOM: { setURL: (url: string) => void } })
  .happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

type Patch = { ifMatch: string | null; csrf: string | null; body: unknown }
let patches: Patch[] = []
let restore: () => void = () => {}

/** A Theorem holding one thread at `revision`, answering each patch with `answer`. */
function theoremWith(revision: number, answer: () => unknown = () => ({})) {
  const routes: FakeRoutes = {
    'GET /api/chat/v1/bootstrap': () => ({ csrfToken: 'csrf', tenantId: 't' }),
    'GET /api/chat/v1/threads/:threadId': ({ threadId }) => ({
      thread: { threadId, revision },
      messages: [],
    }),
    'PATCH /api/chat/v1/threads/:threadId': async (_params, request) => {
      patches.push({
        ifMatch: request.headers.get('If-Match'),
        csrf: request.headers.get('X-CSRF-Token'),
        body: await request.json(),
      })
      return answer()
    },
  }
  restore = installFakeTheorem(routes)
}

afterEach(() => {
  restore()
  patches = []
  useGenerationDefaults.setState({ defaults: {}, onServer: undefined })
  useGenerationOverrides.setState({ byThread: {}, unsaved: {} })
})

const overrides = () => useGenerationOverrides.getState()

test('a changed override is written onto its thread at the thread revision, and the turn then carries none of it', async () => {
  theoremWith(7)
  overrides().change('t1', { responseDetail: 'thorough', runBudget: { maxSteps: 12 } })
  expect(generationTurnOptions('t1')).toEqual({ responseDetail: 'thorough', runBudget: { maxSteps: 12 } })

  await saveThreadGeneration('t1')
  expect(patches).toEqual([
    {
      ifMatch: '7',
      csrf: 'csrf',
      body: { generation: { responseDetail: 'thorough', runBudget: { maxSteps: 12 } } },
    },
  ])
  expect(overrides().unsaved).toEqual({})
  expect(generationTurnOptions('t1')).toEqual({})
  // What the composer shows is unchanged.
  expect(overrides().byThread.t1).toEqual({ responseDetail: 'thorough', runBudget: { maxSteps: 12 } })

  // Nothing changed since, so the next send writes nothing.
  await saveThreadGeneration('t1')
  expect(patches).toHaveLength(1)
})

test('a reset override clears the thread with an empty object', async () => {
  theoremWith(2)
  overrides().change('t1', { effort: 'high' })
  await saveThreadGeneration('t1')
  overrides().reset('t1')
  await saveThreadGeneration('t1')
  expect(patches.map((patch) => patch.body)).toEqual([
    { generation: { effort: 'high' } },
    { generation: {} },
  ])
  expect(overrides().unsaved).toEqual({})
})

test('a Theorem that refuses the field leaves the override waiting, and the turn carries it', async () => {
  theoremWith(1, () =>
    new Response(JSON.stringify({ code: 'invalid_json', title: 'unknown field `generation`' }), {
      status: 422,
      headers: { 'content-type': 'application/problem+json' },
    }),
  )
  overrides().change('t1', { maxOutputTokens: 4000 })
  await saveThreadGeneration('t1')
  expect(patches).toHaveLength(1)
  expect(overrides().unsaved).toEqual({ t1: true })
  expect(generationTurnOptions('t1')).toEqual({ maxOutputTokens: 4000 })
})

test("a thread that loads brings Theorem's override, unless a change here is waiting", () => {
  takeThreadGeneration({ threadId: 't1', generation: { responseDetail: 'concise' } })
  expect(overrides().byThread.t1).toEqual({ responseDetail: 'concise' })
  // Taken from Theorem, so there is nothing to write back or to send.
  expect(overrides().unsaved).toEqual({})
  expect(generationTurnOptions('t1')).toEqual({})

  overrides().change('t1', { responseDetail: 'thorough' })
  takeThreadGeneration({ threadId: 't1', generation: { responseDetail: 'concise' } })
  expect(overrides().byThread.t1).toEqual({ responseDetail: 'thorough' })

  // A thread with no override of its own clears a saved one here.
  takeThreadGeneration({ threadId: 't2', generation: { effort: 'low' } })
  takeThreadGeneration({ threadId: 't2' })
  expect(overrides().byThread.t2).toBeUndefined()
})

test('a change made while the write was in flight stays waiting', async () => {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  theoremWith(4, async () => {
    await held
    return {}
  })
  overrides().change('t1', { effort: 'low' })
  const saving = saveThreadGeneration('t1')
  overrides().change('t1', { effort: 'high' })
  release()
  await saving
  expect(overrides().unsaved).toEqual({ t1: true })
  expect(generationTurnOptions('t1')).toEqual({ effort: 'high' })
})
