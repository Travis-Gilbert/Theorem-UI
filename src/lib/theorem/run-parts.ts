// SOURCING: zod (a run's completion and limits parts are read as untrusted wire data); hand-roll — a run's sequence of prose and tool work, which no library models
import { z } from 'zod'
import { effortLabel } from './generation'
import type { Generation } from './generation'

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

/* ------------------------------------------------------------ prose segments */

/**
 * What a text part says about itself: whether it is commentary on the way or
 * the answer, which prose segment of the run it is, and whether it is still
 * being written. The patched SDK adapter carries it as
 * `providerMetadata.theorem`, because assistant-ui rewrites a part's own
 * `status`. A part from before purposes has none of it and is an answer.
 */
export type TextMeta = {
  purpose?: 'commentary' | 'answer'
  segment?: number
  status?: 'running' | 'complete' | 'incomplete'
}

export const textMeta = (part: { providerMetadata?: unknown }): TextMeta =>
  record(record(part.providerMetadata).theorem)

/** Data parts that belong to a stretch of work between prose and draw nothing of their own: the step line speaks for them. */
const QUIET_STEP_DATA = new Set([
  'theorem-progress',
  'theorem-usage',
  'theorem-expression',
  'theorem-expression_refused',
  'theorem-client_operation',
  'theorem-program',
])

/** Data parts that belong to a stretch of work and draw a card inside it: a specialist's assignment, its review, the goal, a host call. */
const SHOWN_STEP_DATA = new Set([
  'theorem-host_call',
  'theorem-reasoning_summary',
  'theorem-delegation',
  'theorem-review',
  'theorem-intent',
])

export const isStepDataPart = (part: { type: string; name?: string }) =>
  part.type === 'data' &&
  part.name !== undefined &&
  (QUIET_STEP_DATA.has(part.name) || SHOWN_STEP_DATA.has(part.name))

/** Whether a part of a step group draws something inside it, rather than only counting toward its line. */
export const drawsInStep = (part: { type: string; name?: string }) =>
  part.type !== 'data' || (part.name !== undefined && SHOWN_STEP_DATA.has(part.name))

/** The run's own bookkeeping, which no reader counts as something the run said or did. */
const RUN_META = new Set(['theorem-limits', 'theorem-completion'])

/**
 * Whether nothing the reader would count follows `indices` in the message:
 * the group is where the run ended, not a stretch it moved on from.
 */
export const endsRun = (
  content: readonly { type: string; name?: string }[],
  indices: readonly number[],
) =>
  content
    .slice((indices.at(-1) ?? -1) + 1)
    .every((part) => part.type === 'data' && part.name !== undefined && RUN_META.has(part.name))

/** Whether the message's newest part is prose still being written, which is when the "Thinking" line steps aside. */
export const isStreamingProse = (
  content: readonly { type: string; providerMetadata?: unknown }[],
) => {
  const last = content.at(-1)
  return last?.type === 'text' && textMeta(last).status === 'running'
}

/* ------------------------------------------------------- completion and limits */

const count = z.number().nullish()

const source = z.string().nullish()

const limitsSchema = z.object({
  maxOutputTokensPerCall: z
    .object({
      value: z.number(),
      source: z.string(),
      /** Someone chose more than the call could be sent with. */
      clamped: z.boolean().nullish(),
      /** The value chosen, when someone chose one. */
      requested: count,
    })
    .optional(),
  modelMaxOutputTokens: count,
  runBudget: z
    .object({
      maxOutputTokens: count,
      maxOutputTokensSource: source,
      usedOutputTokens: count,
      maxSteps: count,
      maxStepsSource: source,
      usedSteps: count,
    })
    .optional(),
  effort: z
    .object({
      requested: z.string().nullish(),
      source,
      effective: z.string().nullish(),
      /** `applied`, `nearest`, `unsupported` or `not_requested`. */
      reason: z.string().nullish(),
    })
    .optional(),
  responseDetail: z.object({ value: z.string(), source }).optional(),
})

const timingSchema = z.object({
  /** A moment the run never reached is null, the acceptance included. */
  acceptedAtMs: count,
  firstProviderContentAtMs: count,
  firstPartPersistedAtMs: count,
  completedAtMs: count,
})

const completionSchema = z.object({
  stopReason: z.string(),
  detail: z.string().optional(),
  limits: limitsSchema.optional(),
  timing: timingSchema.optional(),
})

export type Limits = z.infer<typeof limitsSchema>
export type Timing = z.infer<typeof timingSchema>
export type Completion = z.infer<typeof completionSchema>

export const readCompletion = (data: unknown): Completion | undefined =>
  completionSchema.safeParse(data).data

/** The `theorem-limits` part carries the limits under a `limits` key. */
export const readLimits = (data: unknown): Limits | undefined =>
  limitsSchema.safeParse(record(data).limits).data

const tokens = (n: number) => `${n.toLocaleString('en-US')} tokens`

/** Which of the limit's sources a person's own setting can move. */
const MOVABLE = new Set(['request', 'conversation', 'preference', 'default'])

export type StopNotice = {
  text: string
  /** The setting that would let the run go further, when raising one would. */
  raise?: { patch: Generation; label: string }
}

/**
 * What a run that hit a limit says for itself. A run that ended, was stopped
 * or failed has no notice here: its outcome line and error already say so.
 * Raising doubles the limit that stopped it, up to the model's own maximum.
 */
export function stopNotice({ stopReason, detail, limits }: Completion): StopNotice | undefined {
  const call = limits?.maxOutputTokensPerCall
  const budget = limits?.runBudget
  switch (stopReason) {
    case 'max_output_tokens': {
      const text =
        detail ??
        (call
          ? `This reply reached its limit of ${tokens(call.value)} for one step.`
          : 'This reply reached its limit for one step.')
      if (!call || !MOVABLE.has(call.source)) return { text }
      const next = Math.min(call.value * 2, limits.modelMaxOutputTokens ?? Infinity)
      return next > call.value
        ? { text, raise: { patch: { maxOutputTokens: next }, label: `Raise to ${tokens(next)}` } }
        : { text }
    }
    case 'run_budget': {
      const text =
        detail ??
        (budget?.maxOutputTokens
          ? `This run used its budget of ${tokens(budget.maxOutputTokens)}.`
          : 'This run used its output budget.')
      return budget?.maxOutputTokens
        ? {
            text,
            raise: {
              patch: { runBudget: { maxOutputTokens: budget.maxOutputTokens * 2 } },
              label: `Raise to ${tokens(budget.maxOutputTokens * 2)}`,
            },
          }
        : { text }
    }
    case 'step_limit': {
      const text =
        detail ??
        (budget?.maxSteps
          ? `This run reached its limit of ${budget.maxSteps} steps.`
          : 'This run reached its limit on steps.')
      return budget?.maxSteps
        ? {
            text,
            raise: {
              patch: { runBudget: { maxSteps: budget.maxSteps * 2 } },
              label: `Raise to ${budget.maxSteps * 2} steps`,
            },
          }
        : { text }
    }
    default:
      return undefined
  }
}

/** Where a limit came from, in the words a person would use. */
const SOURCES: Readonly<Record<string, string>> = {
  request: 'set for this reply',
  conversation: 'set for this conversation',
  preference: 'your default',
  model: "the model's own maximum",
  context: 'what fits in the context window',
  run_budget: 'what is left of the run budget',
  default: "Theorem's default",
}

export type LimitRow = { label: string; value: string; note?: string }

const used = (n: number | null | undefined, cap: number | null | undefined, unit: string): string | undefined => {
  if (typeof cap === 'number') return `${(n ?? 0).toLocaleString('en-US')} of ${cap.toLocaleString('en-US')} ${unit}`
  return typeof n === 'number' ? `${n.toLocaleString('en-US')} ${unit} so far, no cap` : undefined
}

const from = (origin: string | null | undefined) =>
  origin ? { note: SOURCES[origin] ?? origin } : {}

const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

/** What Theorem did with the effort that was asked for, where that needs saying. */
function effortRow(effort: NonNullable<Limits['effort']>): LimitRow | undefined {
  const asked = effort.requested ?? undefined
  const ran = effort.effective ?? undefined
  if (effort.reason === 'unsupported')
    return asked
      ? {
          label: 'Reasoning effort',
          value: 'Not sent',
          note: `this model takes no level; ${effortLabel(asked)} was asked for`,
        }
      : undefined
  if (!asked && !ran) return undefined
  if (asked && ran && asked !== ran)
    return {
      label: 'Reasoning effort',
      value: effortLabel(ran),
      note: `the nearest level this model lists to ${effortLabel(asked)}`,
    }
  return { label: 'Reasoning effort', value: effortLabel((ran ?? asked)!), ...from(effort.source) }
}

/** What a run's limits say, as the rows the limits popover shows; rows the run did not report are left out. */
export function limitRows(limits: Limits): LimitRow[] {
  const call = limits.maxOutputTokensPerCall
  const budget = limits.runBudget
  const detail = limits.responseDetail
  const rows: (LimitRow | undefined)[] = [
    call && {
      label: 'Output per step',
      value: tokens(call.value),
      note:
        call.clamped && typeof call.requested === 'number'
          ? `${SOURCES[call.source] ?? call.source}; ${tokens(call.requested)} was asked for`
          : (SOURCES[call.source] ?? call.source),
    },
    typeof limits.modelMaxOutputTokens === 'number'
      ? { label: 'Model maximum', value: tokens(limits.modelMaxOutputTokens) }
      : undefined,
    budget && used(budget.usedOutputTokens, budget.maxOutputTokens, 'tokens')
      ? {
          label: 'Run output',
          value: used(budget.usedOutputTokens, budget.maxOutputTokens, 'tokens')!,
          ...from(budget.maxOutputTokensSource),
        }
      : undefined,
    budget && used(budget.usedSteps, budget.maxSteps, 'steps')
      ? {
          label: 'Run steps',
          value: used(budget.usedSteps, budget.maxSteps, 'steps')!,
          ...from(budget.maxStepsSource),
        }
      : undefined,
    limits.effort && effortRow(limits.effort),
    detail ? { label: 'Response detail', value: capitalized(detail.value), ...from(detail.source) } : undefined,
  ]
  return rows.filter((row): row is LimitRow => row !== undefined)
}

/** The facts a run published about its limits and timing, from its completion part, else its limits part. */
export function runFacts(
  content: readonly { type: string; name?: string; data?: unknown }[],
): { limits?: Limits; timing?: Timing } {
  const named = (name: string) =>
    content.findLast((part) => part.type === 'data' && part.name === name)?.data
  const completion = readCompletion(named('theorem-completion'))
  const limits = completion?.limits ?? readLimits(named('theorem-limits'))
  return {
    ...(limits ? { limits } : {}),
    ...(completion?.timing ? { timing: completion.timing } : {}),
  }
}

/** The newest assistant message's run facts, with the id the run's first render was noted under. */
export function latestRunFacts(
  messages: readonly {
    role: string
    content: readonly { type: string; name?: string; data?: unknown }[]
    metadata?: { custom?: Record<string, unknown> }
  }[],
) {
  const message = messages.findLast((m) => m.role === 'assistant')
  if (!message) return undefined
  const runId = record(message.metadata?.custom).theoremRunId
  return { ...runFacts(message.content), runId: typeof runId === 'string' ? runId : undefined }
}

/* ---------------------------------------------------------------- first render */

const firstRender = new Map<string, number>()

/** The browser's own clock for the first time a run's prose reached the screen; the first note stands. */
export const noteFirstRender = (runId: string, at = Date.now()) => {
  if (!firstRender.has(runId)) firstRender.set(runId, at)
}

export const firstRenderedAt = (runId: string | undefined) =>
  runId === undefined ? undefined : firstRender.get(runId)

/** The five moments of a run, as milliseconds after it was accepted. Moments the run never recorded are left out. */
export function timingRows(timing: Timing, firstRenderAtMs?: number) {
  const accepted = timing.acceptedAtMs
  // Without the moment the run was accepted there is nothing to measure from.
  if (typeof accepted !== 'number') return []
  const after = (at: number | null | undefined) =>
    typeof at === 'number' ? at - accepted : undefined
  const rows: [label: string, ms: number | undefined][] = [
    ['Accepted', 0],
    ['First content from the model', after(timing.firstProviderContentAtMs)],
    ['First part saved', after(timing.firstPartPersistedAtMs)],
    ['First shown here', after(firstRenderAtMs)],
    ['Completed', after(timing.completedAtMs)],
  ]
  return rows.flatMap(([label, ms]) => (ms === undefined ? [] : [{ label, ms }]))
}

export const spokenMs = (ms: number) =>
  Math.abs(ms) < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
