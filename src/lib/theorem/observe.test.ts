import { afterEach, expect, test } from 'bun:test'
import { hasStatus, isSignedOut } from './client'
import {
  OBSERVE_REFRESH_MS,
  describeStreamEnd,
  describeWaiting,
  formatSpan,
  layLanes,
  nextRunRead,
  readOverview,
  readRunReport,
  shortRunId,
} from './observe'
import type { ObservedRun, RunReport, RunTrace } from './observe'

test('a span reads in the unit a person would say', () => {
  expect(formatSpan(840)).toBe('840 ms')
  expect(formatSpan(1_240)).toBe('1.24 s')
  expect(formatSpan(12_440)).toBe('12.4 s')
  expect(formatSpan(185_000)).toBe('3 min 05 s')
  expect(formatSpan(8_040_000)).toBe('2 h 14 min')
})

test('a span that was never measured is a dash, not zero', () => {
  expect(formatSpan(undefined)).toBe('—')
  expect(formatSpan(null)).toBe('—')
  expect(formatSpan(Number.NaN)).toBe('—')
})

test('a wait names who or what the turn is waiting for', () => {
  expect(describeWaiting({ on: 'approval', name: 'run_command' })).toBe(
    'Your approval of run_command',
  )
  expect(
    describeWaiting({
      on: 'operation',
      kind: 'tool_call',
      name: 'read_file',
      effect: 'read',
      sinceMs: 1,
    }),
  ).toBe('Tool read_file')
  // Model requests are not recorded, so the phrase does not claim one.
  expect(describeWaiting({ on: 'between_steps' })).toBe(
    'The model, or work between steps',
  )
})

const run = (over: Partial<ObservedRun>): ObservedRun => ({
  runId: 'run-1',
  admittedAtMs: 0,
  events: 0,
  operationsStarted: 0,
  operationsFailed: 0,
  openOperations: [],
  operations: [],
  droppedOperations: 0,
  streamsAttached: 0,
  streamsOpened: 0,
  terminalSent: false,
  waiting: { on: 'nothing' },
  ...over,
})

test('a stream that ended before the ending was sent says the page left', () => {
  expect(
    describeStreamEnd(run({ streamsOpened: 1, lastStreamEnd: 'client_gone' })),
  ).toBe('Page left first')
  expect(describeStreamEnd(run({ streamsAttached: 1, streamsOpened: 2 }))).toBe(
    'Attached now',
  )
  expect(describeStreamEnd(run({}))).toBe('Never opened')
})

test('a run id is shortened to its tail', () => {
  expect(shortRunId('run_0123456789abcdef')).toBe('…89abcdef')
  expect(shortRunId('run-1')).toBe('run-1')
})

const trace = (over: Partial<RunTrace>): RunTrace => ({
  runId: 'run-1',
  admittedAtMs: 1_000,
  endedAtMs: 2_000,
  phases: [],
  steps: [],
  droppedSteps: 0,
  usage: { inputTokens: 0, outputTokens: 0, reports: 0 },
  eventsRead: 0,
  skippedEvents: 0,
  truncated: false,
  notRecorded: [],
  ...over,
})

test('steps are laid on the span of the turn', () => {
  const lanes = layLanes(
    trace({
      steps: [
        {
          seq: 3,
          kind: 'tool_call',
          name: 'read_file',
          state: 'complete',
          startedAtMs: 1_250,
          endedAtMs: 1_500,
          events: 2,
        },
        // No recorded start: left out, not placed at zero.
        { seq: 4, kind: 'tool_call', name: 'lost', state: 'failed', events: 1 },
        // A moment, not a span.
        {
          seq: 5,
          kind: 'usage',
          name: 'usage',
          state: 'recorded',
          startedAtMs: 1_600,
          events: 1,
        },
      ],
    }),
    9_999,
  )
  expect([...lanes.values()]).toEqual([
    { seq: 3, left: 0.25, width: 0.25, open: false },
    { seq: 5, left: 0.6, width: 0, open: false },
  ])
})

test('a step still open in an active turn runs to now', () => {
  const lane = layLanes(
    trace({
      endedAtMs: null,
      steps: [
        {
          seq: 2,
          kind: 'host_call',
          name: 'edit',
          state: 'running',
          startedAtMs: 1_500,
          events: 1,
        },
      ],
    }),
    2_000,
  ).get(2)
  expect(lane).toEqual({ seq: 2, left: 0.5, width: 0.5, open: true })
})

test('a step left open by the ending runs to the ending', () => {
  const lane = layLanes(
    trace({
      steps: [
        {
          seq: 2,
          kind: 'tool_call',
          name: 'search',
          state: 'running',
          startedAtMs: 1_750,
          events: 1,
        },
      ],
    }),
    99_000,
  ).get(2)
  expect(lane).toEqual({ seq: 2, left: 0.75, width: 0.25, open: true })
})

test('a trace with no admission time lays nothing', () => {
  expect(layLanes(trace({ admittedAtMs: null }), 5).size).toBe(0)
})

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Answer the next read with this body, and record what was asked for. */
function answer(status: number, body: unknown) {
  const asked: Array<string> = []
  globalThis.fetch = ((input: RequestInfo | URL) => {
    asked.push(String(input))
    return Promise.resolve(Response.json(body, { status }))
  }) as typeof fetch
  return asked
}

// The node writes an absent value as null and leaves out a step's unset
// effect and detail; this is that form, not the page's own.
const nodeRun = {
  runId: 'run-1',
  threadId: null,
  admittedAtMs: 1_000,
  startedAtMs: null,
  firstPartAtMs: null,
  lastProgressAtMs: null,
  endedAtMs: null,
  outcome: null,
  failureCode: null,
  regime: null,
  provider: null,
  model: null,
  events: 1,
  operationsStarted: 0,
  operationsFailed: 0,
  openOperations: [],
  operations: [],
  droppedOperations: 0,
  streamsAttached: 0,
  streamsOpened: 0,
  lastStreamEnd: null,
  terminalSent: false,
  waiting: { on: 'start' },
}

const nodeOverview = {
  schema: 'theorem.observe.overview/v1',
  generatedAtMs: 2_000,
  operator: false,
  node: {
    status: 'ready',
    phase: null,
    detail: null,
    version: '0.1.0',
    gitSha: null,
    builtAtUnix: null,
    profile: null,
    observingSinceMs: 500,
  },
  turns: {
    active: 1,
    waitingOnYou: 0,
    windowMs: 1_800_000,
    ended: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    duration: { sample: 0, p50Ms: null, p95Ms: null },
    firstOutput: { sample: 0, p50Ms: null, p95Ms: null },
  },
  active: [nodeRun],
  recent: [],
  alerts: [
    {
      id: 'storage_low',
      title: 'Storage is nearly full',
      severity: 'critical',
      scope: 'node',
      state: 'unavailable',
      summary: 'Storage figures are read with operator access.',
      next: 'Free space on the data volume.',
    },
  ],
  limits: {
    observedSinceMs: 500,
    capacity: 512,
    retained: 1,
    evicted: 0,
    evictedActive: 0,
    scope: 'turns this identity started',
    durableCheck: 'checked',
    notes: ['Nothing here is a durable record.'],
  },
  nodeTotals: null,
  telemetry: {
    export: { state: 'not_configured', detail: 'No exporter is configured.' },
  },
}

test("the node's overview is read as the node writes it", async () => {
  const asked = answer(200, nodeOverview)
  const overview = await readOverview()
  expect(asked).toEqual(['/api/observe/v1/overview'])
  expect(overview.active[0]?.waiting).toEqual({ on: 'start' })
  expect(overview.turns.duration.p50Ms).toBeNull()
  expect(overview.nodeTotals).toBeNull()
  expect(overview.alerts[0]?.state).toBe('unavailable')
})

test("a turn's trace is read as the node writes it", async () => {
  const asked = answer(200, {
    schema: 'theorem.observe.run/v1',
    generatedAtMs: 2_000,
    runId: 'run/1',
    threadId: 'thread-1',
    status: 'closed',
    terminal: true,
    trace: {
      schema: 'theorem.observe.run-trace/v1',
      runId: 'run/1',
      admittedAtMs: 1_000,
      startedAtMs: 1_010,
      firstOutputAtMs: null,
      firstTextAtMs: null,
      endedAtMs: 1_900,
      outcome: 'completed',
      regime: null,
      provider: null,
      model: null,
      phases: [
        { name: 'waiting_to_start', startedAtMs: 1_000, endedAtMs: 1_010 },
      ],
      steps: [
        {
          seq: 1,
          kind: 'admitted',
          name: 'Admitted',
          state: 'recorded',
          startedAtMs: 1_000,
          endedAtMs: null,
          events: 1,
        },
      ],
      droppedSteps: 0,
      usage: { inputTokens: 0, outputTokens: 0, reports: 0 },
      failure: null,
      eventsRead: 3,
      skippedEvents: 0,
      truncated: false,
      notRecorded: ['Provider retries inside one model request.'],
    },
    live: null,
    liveNote: 'This process holds no live observation of the turn.',
  })
  const report = await readRunReport('run/1')
  // The id is one path segment whatever it contains.
  expect(asked).toEqual(['/api/observe/v1/runs/run%2F1'])
  expect(report.trace.steps[0]?.effect).toBeUndefined()
  expect(report.live).toBeNull()
})

test('a refusal is the error the shell already knows how to read', async () => {
  answer(401, { code: 'theorem_signed_out', title: 'Sign in to Theorem' })
  const signedOut = await readOverview().catch((error: unknown) => error)
  expect(isSignedOut(signedOut)).toBe(true)

  answer(403, { code: 'observe_not_for_visitors' })
  const refused = await readOverview().catch((error: unknown) => error)
  expect(hasStatus(refused, 403)).toBe(true)
})

test('an answer in another form is an error, not an empty page', async () => {
  answer(200, { ...nodeOverview, turns: undefined })
  expect(readOverview()).rejects.toThrow('does not read')
  answer(200, {
    ...nodeOverview,
    active: [{ ...nodeRun, waiting: { on: 'something_new' } }],
  })
  expect(readOverview()).rejects.toThrow('does not read')
})

test('an active turn is read again after a failure that may pass', async () => {
  // Nothing read yet, nothing wrong: read again.
  expect(nextRunRead(undefined, null)).toBe(OBSERVE_REFRESH_MS)

  answer(502, { code: 'theorem_upstream_unreachable' })
  const unreachable = await readRunReport('run-1').catch(
    (error: unknown) => error,
  )
  expect(nextRunRead(undefined, unreachable)).toBe(OBSERVE_REFRESH_MS)
  // The connection dropped before any answer.
  expect(nextRunRead(undefined, new TypeError('fetch failed'))).toBe(
    OBSERVE_REFRESH_MS,
  )
})

test('reads stop when the turn ended or the refusal will not change', async () => {
  for (const status of [401, 403, 404]) {
    answer(status, { code: 'refused' })
    const refused = await readRunReport('run-1').catch(
      (error: unknown) => error,
    )
    expect(nextRunRead(undefined, refused)).toBe(false)
  }
  const ended = { terminal: true } as RunReport
  expect(nextRunRead(ended, null)).toBe(false)
  // An ended turn stays ended whatever a later read said.
  expect(nextRunRead(ended, new TypeError('fetch failed'))).toBe(false)
})
