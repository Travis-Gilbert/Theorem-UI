// SOURCING: bun:test over the real SDK passthrough and client.mutate, with window.fetch answered in process by stories/fake-theorem; the work tracker's settings document, answered the way the contract describes
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test'
import { installFakeTheorem } from '@/stories/fake-theorem'
import { TheoremError } from '@theoremharness/sdk'
import { withConsequence, writeConsequence } from './work-consequences'
import type { WorkSettings } from './work-consequences'

const page = (window as unknown as { happyDOM: { setURL: (url: string) => void } })
  .happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

const document = (revision: string): WorkSettings => ({
  enabled: true,
  github: { enabled: true, repos: ['acme/api'] },
  consequences: [
    { id: 'push_refreshes_context', enabled: true },
    { id: 'review_request_creates_inbox_entry', enabled: true },
    { id: 'failed_workflow_starts_investigation', enabled: false },
    { id: 'issue_comment_joins_task', enabled: true },
  ],
  sync: { state: 'idle', lastSyncedAt: '2026-11-09T10:00:00Z' },
  revision,
})

type Put = { ifMatch: string | null; body: WorkSettings }
let current: WorkSettings
let puts: Put[]
/** Statuses the next writes are refused with, oldest first. */
let refusals: number[]
/** The document the server holds once it has refused a write. */
let movesOnRefusal: WorkSettings | undefined
let restore: () => void = () => {}

beforeEach(() => {
  current = document('r1')
  puts = []
  refusals = []
  movesOnRefusal = undefined
  restore = installFakeTheorem({
    'GET /api/chat/v1/bootstrap': () => ({ csrfToken: 'csrf', tenantId: 't' }),
    'GET /api/work/v1/settings': () => current,
    'PUT /api/work/v1/settings': async (_params, request) => {
      puts.push({
        ifMatch: request.headers.get('If-Match'),
        body: (await request.json()) as WorkSettings,
      })
      const status = refusals.shift()
      if (status) {
        if (movesOnRefusal) current = movesOnRefusal
        return new Response(JSON.stringify({ title: 'Refused', detail: 'The settings moved.' }), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      }
      const written = { ...puts.at(-1)!.body, revision: 'r-next' }
      current = written
      return written
    },
  })
})
afterEach(() => restore())

test('withConsequence changes one switch and leaves every other field as it was', () => {
  const next = withConsequence(document('r1'), 'failed_workflow_starts_investigation', true)
  expect(next.consequences.find((entry) => entry.id === 'failed_workflow_starts_investigation')?.enabled).toBe(true)
  expect(next).toEqual({
    ...document('r1'),
    consequences: document('r1').consequences.map((entry) =>
      entry.id === 'failed_workflow_starts_investigation'
        ? { ...entry, enabled: true }
        : entry,
    ),
  })
})

test('a consequence the server did not list is added rather than lost', () => {
  const sparse: WorkSettings = {
    ...document('r1'),
    consequences: [{ id: 'push_refreshes_context', enabled: true }],
  }
  expect(withConsequence(sparse, 'issue_comment_joins_task', true).consequences).toEqual([
    { id: 'push_refreshes_context', enabled: true },
    { id: 'issue_comment_joins_task', enabled: true },
  ])
})

test('the switch writes the whole document back with the revision it was read at', async () => {
  const written = await writeConsequence('push_refreshes_context', false)
  expect(puts).toHaveLength(1)
  expect(puts[0]!.ifMatch).toBe('r1')
  // Everything but the one switch is what the server sent, including fields this page does not own.
  expect(puts[0]!.body).toEqual(
    withConsequence(document('r1'), 'push_refreshes_context', false),
  )
  expect(puts[0]!.body.enabled).toBe(true)
  expect(puts[0]!.body.github).toEqual({ enabled: true, repos: ['acme/api'] })
  expect(puts[0]!.body.sync).toEqual(document('r1').sync)
  expect(written.revision).toBe('r-next')
})

test("another tab's change is not overwritten by a stale copy", async () => {
  // The page showed r1; before the write, someone turned the tracker's repos list around.
  current = { ...document('r2'), github: { enabled: true, repos: ['acme/api', 'acme/web'] } }
  await writeConsequence('issue_comment_joins_task', false)
  expect(puts[0]!.ifMatch).toBe('r2')
  expect(puts[0]!.body.github.repos).toEqual(['acme/api', 'acme/web'])
})

test('a revision that moved between the read and the write is read again once', async () => {
  refusals = [412]
  await writeConsequence('push_refreshes_context', false)
  expect(puts).toHaveLength(2)
  expect(puts.map((put) => put.ifMatch)).toEqual(['r1', 'r1'])
})

test('a conflict is retried against the newer revision', async () => {
  refusals = [409]
  // The server moves on while it refuses the first write.
  movesOnRefusal = document('r9')
  const written = await writeConsequence('push_refreshes_context', false)
  expect(puts.map((put) => put.ifMatch)).toEqual(['r1', 'r9'])
  expect(written.revision).toBe('r-next')
})

test('a second refusal is the person\'s to see, not another retry', async () => {
  refusals = [412, 412]
  const error = await writeConsequence('push_refreshes_context', false).catch(
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(TheoremError)
  expect((error as TheoremError).statusCode).toBe(412)
  expect(puts).toHaveLength(2)
})

test('a refusal that is not about the revision is not retried', async () => {
  refusals = [422]
  const error = await writeConsequence('push_refreshes_context', false).catch(
    (caught: unknown) => caught,
  )
  expect((error as TheoremError).statusCode).toBe(422)
  expect(puts).toHaveLength(1)
})
