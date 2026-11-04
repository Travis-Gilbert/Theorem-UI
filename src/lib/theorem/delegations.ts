// SOURCING: @tanstack/react-query (receipt content by ref, cached for good since refs name fixed bytes; experimental_streamedQuery folds a specialist's run events into its parts), @assistant-ui/react thread state and fromThreadMessageLike, @theoremharness/sdk/assistant-ui toAssistantMessages (the chat's own part mapping), zustand for the dock's opener; the part shapes are Theorem's delegation contract as @theoremharness/sdk generates it
//
// Delegated work reaches the conversation as three data parts: one per
// delegation (`theorem-delegation`), one per review decision
// (`theorem-review`) and one per intent revision (`theorem-intent`). Each
// keeps one part id for its record, so a later state replaces the part.
import { fromThreadMessageLike, useAuiState } from '@assistant-ui/react'
import type { MessageStatus, ThreadMessage } from '@assistant-ui/react'
import { experimental_streamedQuery, useQuery } from '@tanstack/react-query'
import { TheoremError } from '@theoremharness/sdk'
import type { TheoremContextReference, TheoremRange } from '@theoremharness/sdk'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import { useMemo } from 'react'
import { create } from 'zustand'
import { TERMINAL_RUN_EVENTS, describeError, theorem } from './client'
import type { Theorem } from './client'

export const DELEGATION_PART = 'theorem-delegation'
export const REVIEW_PART = 'theorem-review'
export const INTENT_PART = 'theorem-intent'

export type DelegationState = Theorem.DelegationState
export type ReviewVerdict = Theorem.ReviewVerdict
export type ChangeAdmission = Theorem.ChangeAdmission
export type ChangeSetEntry = Theorem.ChangeSetEntry
export type ReceiptCheck = Theorem.ReceiptCheck
export type ReceiptSummary = Theorem.ReceiptSummary
export type DelegationPart = Theorem.DelegationPart
export type IntentPart = Theorem.IntentPart
/** The resources a delegation adds to Theorem's reference vocabulary. */
export type DelegationResource = Theorem.DelegationResource

/** A review decision. Verdicts name the judged role once Theorem's contract carries it. */
export type ReviewPart = Omit<Theorem.ReviewPart, 'verdicts'> & {
  verdicts: (Theorem.ReviewPart.Verdicts.Item & { roleLabel?: string })[]
}

/** A context reference to a delegation or one of its changes. */
export type DelegationReference = Omit<TheoremContextReference, 'location'> & {
  location: { resource: DelegationResource; range?: TheoremRange }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

/** A delegation part's data, or undefined when it is not one. */
export function readDelegation(data: unknown): DelegationPart | undefined {
  if (!isRecord(data)) return undefined
  return isString(data.delegationId) &&
    isString(data.parentRunId) &&
    isString(data.state) &&
    isRecord(data.intent)
    ? (data as unknown as DelegationPart)
    : undefined
}

export function readReview(data: unknown): ReviewPart | undefined {
  if (!isRecord(data)) return undefined
  return isString(data.reviewId) && Array.isArray(data.verdicts)
    ? (data as unknown as ReviewPart)
    : undefined
}

export function readIntent(data: unknown): IntentPart | undefined {
  if (!isRecord(data)) return undefined
  return isString(data.intentId) && isString(data.goal)
    ? (data as unknown as IntentPart)
    : undefined
}

/** States in which the specialist has not settled yet. */
export const LIVE_DELEGATION_STATES: ReadonlySet<DelegationState> = new Set([
  'proposed',
  'admitted',
  'started',
])

const POLLING_DELEGATION_STATES = new Set([...LIVE_DELEGATION_STATES, 'published'])

/** The side of a change that exists: the new file, or the base of a deletion. */
export const changeSide = (change: ChangeSetEntry): 'before' | 'after' =>
  change.change === 'delete' ? 'before' : 'after'

/** The receipt bytes one ref names, as text. Refs name fixed bytes, so they never go stale. */
export function useDelegationContent(
  runId: string,
  delegationId: string,
  ref: string | undefined,
) {
  return useQuery({
    queryKey: ['delegation-content', runId, delegationId, ref],
    enabled: ref !== undefined,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      try {
        const content = await theorem().chat.runs.delegationContent(
          { runId, delegationId, ref: ref! },
          { abortSignal: signal },
        )
        return new TextDecoder().decode(await content.arrayBuffer())
      } catch (error) {
        throw new Error(
          error instanceof TheoremError && error.statusCode === 404
            ? 'This change is no longer stored.'
            : describeError(error),
        )
      }
    },
  })
}

/** The latest record of a delegation in the conversation on screen. */
export function useThreadDelegation(
  delegationId: string,
): DelegationPart | undefined {
  const messages = useAuiState((s) => s.thread.messages)
  const stored = useMemo(() => {
    let latest: DelegationPart | undefined
    for (const message of messages) {
      if (message.role !== 'assistant') continue
      for (const part of message.content) {
        if (part.type !== 'data' || part.name !== DELEGATION_PART) continue
        const delegation = readDelegation(part.data)
        if (delegation?.delegationId === delegationId) latest = delegation
      }
    }
    return latest
  }, [messages, delegationId])
  return useLiveDelegation(stored)
}

function currentDelegation(
  seed: DelegationPart | undefined,
  records: readonly DelegationPart[] | undefined,
) {
  if (!seed) return undefined
  const polled = records?.find((item) => item.delegationId === seed.delegationId)
  return polled && polled.updatedAtMs >= seed.updatedAtMs ? polled : seed
}

/** Work outlives its parent response, so its durable record owns the card's status. */
export function useLiveDelegation(
  seed: DelegationPart | undefined,
): DelegationPart | undefined {
  const query = useQuery({
    queryKey: ['theorem', 'delegations', seed?.parentRunId],
    enabled: !!seed,
    queryFn: ({ signal }) =>
      theorem().chat.runs.delegations(
        { runId: seed!.parentRunId },
        { abortSignal: signal },
      ),
    refetchInterval: ({ state }) => {
      const current = currentDelegation(seed, state.data?.delegations)
      if (!current || !POLLING_DELEGATION_STATES.has(current.state)) return undefined
      if (current.state === 'published' && current.problem) return undefined
      return 2000
    },
    staleTime: 1000,
  })
  return currentDelegation(seed, query.data?.delegations)
}

/** Set while the desktop dock is mounted: opens a delegation's panel. */
export const useDelegationDock = create<{
  open?: (delegationId: string) => void
}>(() => ({}))

const RESUME_ATTEMPTS = 8

/** A run's events up to its terminal event, resuming after the last one seen when the stream drops. */
async function* runEvents(
  runId: string,
  signal: AbortSignal,
): AsyncGenerator<Theorem.RunEvent> {
  let after = 0
  for (let attempt = 0; ; attempt++) {
    try {
      const stream = await theorem().chat.runs.events(
        { runId, after_seq: after },
        { abortSignal: signal },
      )
      for await (const event of stream) {
        attempt = 0
        after = event.seq
        yield event
        if (TERMINAL_RUN_EVENTS.has(event.sourceEventType)) return
      }
    } catch (error) {
      if (signal.aborted || attempt + 1 >= RESUME_ATTEMPTS) throw error
    }
    if (attempt + 1 >= RESUME_ATTEMPTS)
      throw new Error(`The run ${runId} disconnected before it ended`)
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(250 * 2 ** attempt, 2000)),
    )
  }
}

type RunParts = {
  parts: ReadonlyMap<string, Theorem.StoredPart>
  /** The terminal event, once the run has ended. */
  ended?: string
}

function addRunEvent(run: RunParts, event: Theorem.RunEvent): RunParts {
  if (event.sourceEventType === 'CHAT.MESSAGE.PART') {
    const part = event.payload.part as Record<string, unknown> | undefined
    if (typeof part?.partId !== 'string' || typeof part.type !== 'string')
      return run
    return {
      ...run,
      parts: new Map(run.parts).set(part.partId, {
        partId: part.partId,
        type: part.type,
        payload: part,
      }),
    }
  }
  return TERMINAL_RUN_EVENTS.has(event.sourceEventType)
    ? { ...run, ended: event.sourceEventType }
    : run
}

const runStatus = (ended: string | undefined): MessageStatus =>
  ended === undefined
    ? { type: 'running' }
    : ended === 'RUN.CLOSED'
      ? { type: 'complete', reason: 'stop' }
      : {
          type: 'incomplete',
          reason: ended === 'RUN.CANCELLED' ? 'cancelled' : 'error',
        }

/**
 * A specialist's run as one assistant message, built with the chat's own part
 * mapping and followed while the run goes on.
 */
export function useSpecialistRun(runId: string) {
  const query = useQuery({
    queryKey: ['specialist-run', runId],
    queryFn: experimental_streamedQuery<Theorem.RunEvent, RunParts>({
      streamFn: ({ signal }) => runEvents(runId, signal),
      reducer: addRunEvent,
      initialValue: { parts: new Map() },
    }),
    // An ended run is fixed; one still going reads again when it comes back into view.
    staleTime: ({ state }) => (state.data?.ended ? Infinity : 0),
    refetchOnWindowFocus: false,
    retry: false,
  })
  const run = query.data
  const message = useMemo((): ThreadMessage | undefined => {
    if (!run?.parts.size) return undefined
    const [like] = toAssistantMessages([
      {
        schema: 'theorem.chat.message.v1',
        messageId: runId,
        tenantId: '',
        threadId: '',
        originBranchId: '',
        role: 'assistant',
        parts: [...run.parts.values()],
        createdAtMs: 0,
      },
    ])
    const status = runStatus(run.ended)
    return like && fromThreadMessageLike({ ...like, status }, runId, status)
  }, [run, runId])
  return { message, error: query.error }
}
