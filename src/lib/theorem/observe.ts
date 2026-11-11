// SOURCING: zod (the node's observe responses are parsed at the boundary; the vendored SDK has no observe endpoints yet), @tanstack/react-query (polling server state), @theoremharness/sdk TheoremError (so the shell's error helpers read these refusals too)
import { queryOptions, useQuery } from '@tanstack/react-query'
import { TheoremError } from '@theoremharness/sdk'
import { z } from 'zod'

const ms = z.number().nullish()
const text = z.string().nullish()

const waitingShape = z.discriminatedUnion('on', [
  z.object({ on: z.literal('nothing') }),
  z.object({ on: z.literal('start') }),
  z.object({ on: z.literal('approval'), name: z.string() }),
  z.object({ on: z.literal('client'), name: z.string() }),
  z.object({
    on: z.literal('operation'),
    kind: z.string(),
    name: z.string(),
    effect: z.string(),
    sinceMs: z.number(),
  }),
  z.object({ on: z.literal('between_steps') }),
])

const operationShape = z.object({
  kind: z.string(),
  name: z.string(),
  effect: z.string(),
  startedAtMs: z.number(),
  endedAtMs: ms,
  failed: z.boolean().nullish(),
})

const outcome = z.enum(['completed', 'failed', 'cancelled'])

const runShape = z.object({
  runId: z.string(),
  threadId: text,
  admittedAtMs: z.number(),
  startedAtMs: ms,
  firstPartAtMs: ms,
  lastProgressAtMs: ms,
  endedAtMs: ms,
  outcome: outcome.nullish(),
  failureCode: text,
  regime: text,
  provider: text,
  model: text,
  events: z.number(),
  operationsStarted: z.number(),
  operationsFailed: z.number(),
  openOperations: z.array(operationShape),
  operations: z.array(operationShape),
  droppedOperations: z.number(),
  streamsAttached: z.number(),
  streamsOpened: z.number(),
  lastStreamEnd: z
    .enum(['terminal', 'client_gone', 'poll_failed', 'drained'])
    .nullish(),
  terminalSent: z.boolean(),
  waiting: waitingShape,
})

const quantiles = z.object({ sample: z.number(), p50Ms: ms, p95Ms: ms })

const alertShape = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(['critical', 'warning']),
  scope: z.enum(['node', 'your_turns']),
  state: z.enum(['ok', 'firing', 'insufficient_data', 'unavailable']),
  summary: z.string(),
  next: z.string(),
})

const limitsShape = z.object({
  observedSinceMs: z.number(),
  capacity: z.number(),
  retained: z.number(),
  evicted: z.number(),
  evictedActive: z.number(),
  scope: z.string(),
  durableCheck: z.enum(['not_needed', 'checked', 'unavailable']),
  notes: z.array(z.string()),
})

const signalShape = z.object({ state: z.string(), detail: z.string() })

const overviewShape = z.object({
  generatedAtMs: z.number(),
  operator: z.boolean(),
  node: z.object({
    status: z.enum(['ready', 'recovering', 'failed']),
    phase: text,
    detail: text,
    version: z.string(),
    gitSha: text,
    builtAtUnix: text,
    profile: text,
    observingSinceMs: z.number(),
  }),
  turns: z.object({
    active: z.number(),
    waitingOnYou: z.number(),
    windowMs: z.number(),
    ended: z.number(),
    completed: z.number(),
    failed: z.number(),
    cancelled: z.number(),
    duration: quantiles,
    firstOutput: quantiles,
  }),
  active: z.array(runShape),
  recent: z.array(runShape),
  alerts: z.array(alertShape),
  limits: limitsShape,
  nodeTotals: z
    .object({
      admitted: z.number(),
      completed: z.number(),
      failed: z.number(),
      cancelled: z.number(),
      streamsOpened: z.number(),
      streamsEndedAtTerminal: z.number(),
      streamsClientGone: z.number(),
      streamsPollFailed: z.number(),
      streamsDrained: z.number(),
    })
    .nullish(),
  telemetry: z.record(z.string(), signalShape),
})

const stepShape = z.object({
  seq: z.number(),
  kind: z.string(),
  name: z.string(),
  state: z.enum([
    'running',
    'waiting',
    'complete',
    'failed',
    'denied',
    'expired',
    'recorded',
  ]),
  startedAtMs: ms,
  endedAtMs: ms,
  effect: text,
  detail: text,
  events: z.number(),
})

const traceShape = z.object({
  runId: z.string(),
  admittedAtMs: ms,
  startedAtMs: ms,
  firstOutputAtMs: ms,
  firstTextAtMs: ms,
  endedAtMs: ms,
  outcome: outcome.nullish(),
  regime: text,
  provider: text,
  model: text,
  phases: z.array(
    z.object({ name: z.string(), startedAtMs: z.number(), endedAtMs: ms }),
  ),
  steps: z.array(stepShape),
  droppedSteps: z.number(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    reports: z.number(),
  }),
  failure: z
    .object({ code: z.string(), message: z.string(), correlationId: text })
    .nullish(),
  eventsRead: z.number(),
  skippedEvents: z.number(),
  truncated: z.boolean(),
  notRecorded: z.array(z.string()),
})

const runReportShape = z.object({
  generatedAtMs: z.number(),
  runId: z.string(),
  threadId: text,
  status: z.string(),
  terminal: z.boolean(),
  trace: traceShape,
  live: runShape.nullish(),
  liveNote: z.string(),
})

export type ObserveOverview = z.infer<typeof overviewShape>
export type ObservedRun = z.infer<typeof runShape>
export type ObservedOperation = z.infer<typeof operationShape>
export type Waiting = z.infer<typeof waitingShape>
export type ObserveAlert = z.infer<typeof alertShape>
export type ObserveLimits = z.infer<typeof limitsShape>
export type RunReport = z.infer<typeof runReportShape>
export type RunTrace = z.infer<typeof traceShape>
export type TraceStep = z.infer<typeof stepShape>

/**
 * One read of the node's observe API through this origin's proxy. A refusal
 * is thrown as the SDK's error so `describeError` and `isSignedOut` read it;
 * a reply this page cannot read is an error, never an empty page.
 */
async function read<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/observe/v1/${path}`, {
    headers: { accept: 'application/json' },
    signal,
  })
  const body: unknown = await response.json().catch(() => undefined)
  if (!response.ok)
    throw new TheoremError({ statusCode: response.status, body })
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    throw new Error(
      'The node answered in a form this page does not read. The page and the node may be different versions.',
    )
  return parsed.data
}

/** How often the page asks again while it is open. */
export const OBSERVE_REFRESH_MS = 5_000

export const readOverview = (signal?: AbortSignal) =>
  read('overview', overviewShape, signal)

export const readRunReport = (runId: string, signal?: AbortSignal) =>
  read(`runs/${encodeURIComponent(runId)}`, runReportShape, signal)

export const overviewQuery = () =>
  queryOptions({
    queryKey: ['theorem', 'observe', 'overview'],
    queryFn: ({ signal }) => readOverview(signal),
    refetchInterval: OBSERVE_REFRESH_MS,
    retry: false,
  })

export const runReportQuery = (runId: string) =>
  queryOptions({
    queryKey: ['theorem', 'observe', 'run', runId],
    queryFn: ({ signal }) => readRunReport(runId, signal),
    // A turn that has ended has a settled trace; stop asking.
    refetchInterval: (query) =>
      query.state.data?.terminal || query.state.error
        ? false
        : OBSERVE_REFRESH_MS,
    retry: false,
  })

export const useObserveOverview = () => useQuery(overviewQuery())
export const useRunReport = (runId: string) => useQuery(runReportQuery(runId))

/** A span of time as a person reads it: 840 ms, 12.4 s, 3 min 05 s, 2 h 14 min. */
export function formatSpan(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return '—'
  const span = Math.max(0, value)
  if (span < 1_000) return `${Math.round(span)} ms`
  if (span < 60_000) return `${(span / 1_000).toFixed(span < 10_000 ? 2 : 1)} s`
  const seconds = Math.floor(span / 1_000)
  if (seconds < 3_600)
    return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`
  const minutes = Math.floor(seconds / 60)
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

/** What an active turn is waiting for, in a phrase. */
export function describeWaiting(waiting: Waiting): string {
  switch (waiting.on) {
    case 'nothing':
      return 'Ended'
    case 'start':
      return 'Waiting to start'
    case 'approval':
      return `Your approval of ${waiting.name}`
    case 'client':
      return 'This page, for a workspace request'
    case 'operation':
      return `${waiting.kind === 'host_call' ? 'Host call' : 'Tool'} ${waiting.name}`
    case 'between_steps':
      return 'The model, or work between steps'
  }
}

/** Whether the wait is on the person, so the row asks for attention. */
export const waitsOnYou = (waiting: Waiting) => waiting.on === 'approval'

/** How an event stream to a browser last ended, for a turn's row. */
export function describeStreamEnd(run: ObservedRun): string {
  if (run.streamsAttached > 0) return 'Attached now'
  switch (run.lastStreamEnd) {
    case 'terminal':
      return 'Sent the ending'
    case 'client_gone':
      return 'Page left first'
    case 'poll_failed':
      return 'Ended on a read error'
    case 'drained':
      return 'Closed for shutdown'
    default:
      return run.streamsOpened ? 'Open' : 'Never opened'
  }
}

/** A short handle for a run id: its last eight characters. */
export const shortRunId = (runId: string) =>
  runId.length > 10 ? `…${runId.slice(-8)}` : runId

/** The model a turn ran on, as far as its record says. */
export function describeModel(source: {
  provider?: string | null
  model?: string | null
}): string | undefined {
  if (source.model && source.provider)
    return `${source.provider} · ${source.model}`
  return source.model ?? source.provider ?? undefined
}

export type Lane = {
  seq: number
  /** Offset and width as fractions of the turn, both within 0..1. */
  left: number
  /** Zero for a step that is a moment, not a span. */
  width: number
  /** Still open: drawn to the right-hand edge, which is now. */
  open: boolean
}

/**
 * Each step's place on the turn's own span, for the waterfall. A step that
 * is still running or waiting runs to `nowMs`; in a turn that has ended it
 * runs to the ending. A step with no recorded start has no lane: it is left
 * out, not placed at zero.
 */
export function layLanes(trace: RunTrace, nowMs: number): Map<number, Lane> {
  const lanes = new Map<number, Lane>()
  const from = trace.admittedAtMs
  if (from === null || from === undefined) return lanes
  const until = Math.max(trace.endedAtMs ?? nowMs, from + 1)
  const total = until - from
  const place = (at: number) => Math.min(Math.max(at, from), until)
  for (const item of trace.steps) {
    if (item.startedAtMs === null || item.startedAtMs === undefined) continue
    const start = place(item.startedAtMs)
    const closed = item.endedAtMs !== null && item.endedAtMs !== undefined
    const open =
      !closed && (item.state === 'running' || item.state === 'waiting')
    const end = closed ? place(item.endedAtMs!) : open ? until : start
    lanes.set(item.seq, {
      seq: item.seq,
      left: (start - from) / total,
      width: Math.max(end - start, 0) / total,
      open,
    })
  }
  return lanes
}
