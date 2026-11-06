// SOURCING: zustand, as lib/life/store; the deadline timer is the addendum's semantic clock (ADDENDUM-2 §5: the done hold expires on a timer scheduled for the next deadline, independent of any animation frame)
import { useEffect, useId } from 'react'
import { create } from 'zustand'
import {
  DONE_HOLD_MS,
  livenessOf,
  readExpression,
  resolvePose,
} from './liveness'
import type { KitExpression, Liveness, Pose } from './liveness'
import { kitFactsOf } from './facts'
import type { SourceFacts } from './facts'
import type { ThreadMessage } from '@assistant-ui/react'

/**
 * Kit: one figure for the one agent, whichever conversation it is busy in.
 * Every mounted conversation reports its facts under its own key; liveness is
 * derived from all of them together, and the expression is the agent's,
 * not a conversation's.
 */
interface KitState {
  readonly sources: Readonly<Record<string, SourceFacts>>
  readonly attending: boolean
  /** When the done hold ends, as epoch milliseconds; 0 when there is none. */
  readonly doneUntil: number
  readonly liveness: Liveness
  /** The agent's last accepted manner, from the identity or the live turn. */
  readonly expression: KitExpression | undefined
  /** The pose the figure takes now: the expression's when liveness allows it. */
  readonly pose: Pose
  /** The live expression part last applied, so a replayed one applies once. */
  readonly appliedPartId: string | undefined
}

const initial: KitState = {
  sources: {},
  attending: false,
  doneUntil: 0,
  liveness: 'idle',
  expression: undefined,
  pose: 'rest',
  appliedPartId: undefined,
}

export const useKit = create<KitState>(() => initial)

const any = (sources: KitState['sources'], fact: 'running' | 'asking') =>
  Object.values(sources).some((source) => source[fact])

/** Recomputes what follows from the facts; a turn ending starts the done hold. */
function settle(
  previous: KitState,
  next: Partial<KitState>,
  now: number,
): KitState {
  const state = { ...previous, ...next }
  const busy = any(state.sources, 'running') || any(state.sources, 'asking')
  const wasBusy = previous.liveness === 'work' || previous.liveness === 'ask'
  const doneUntil =
    wasBusy && !busy && next.sources ? now + DONE_HOLD_MS : state.doneUntil
  const liveness = livenessOf(
    {
      asking: any(state.sources, 'asking'),
      running: any(state.sources, 'running'),
      attending: state.attending,
      doneUntil,
    },
    now,
  )
  return {
    ...state,
    doneUntil,
    liveness,
    pose: resolvePose(state.expression, liveness),
  }
}

const sameFacts = (a: SourceFacts | undefined, b: SourceFacts) =>
  a?.running === b.running &&
  a.asking === b.asking &&
  a.expression?.partId === b.expression?.partId

/** One conversation's facts, under a key it keeps while mounted. */
export function reportKit(
  source: string,
  facts: SourceFacts,
  now = Date.now(),
) {
  const previous = useKit.getState()
  if (sameFacts(previous.sources[source], facts)) return
  const live = facts.expression
  const fresh =
    live && live.partId !== previous.appliedPartId ? live : undefined
  useKit.setState(
    settle(
      previous,
      {
        sources: { ...previous.sources, [source]: facts },
        ...(fresh && { expression: fresh.value, appliedPartId: fresh.partId }),
      },
      now,
    ),
    true,
  )
}

/** A conversation that unmounted reports nothing more; its run is not a turn that ended here. */
export function forgetKit(source: string, now = Date.now()) {
  const previous = useKit.getState()
  if (!(source in previous.sources)) return
  const sources = Object.fromEntries(
    Object.entries(previous.sources).filter(([key]) => key !== source),
  )
  // Settled without `sources` in the change, so no done hold starts.
  useKit.setState(settle({ ...previous, sources }, {}, now), true)
}

/** Composer focus: the person is about to say something. */
export function attendKit(attending: boolean, now = Date.now()) {
  const previous = useKit.getState()
  if (previous.attending === attending) return
  useKit.setState(settle(previous, { attending }, now), true)
}

/**
 * The agent's manner as its identity holds it (a thread snapshot's
 * `figureExpression`). It is what the figure mounts with; a live turn's
 * expression replaces it as it arrives.
 */
export function settleKitExpression(value: unknown, now = Date.now()) {
  const expression = readExpression(value)
  if (!expression) return
  useKit.setState(settle(useKit.getState(), { expression }, now), true)
}

/** Advances the clock: the done hold expires into whatever the facts say now. */
export function tickKit(now = Date.now()) {
  const previous = useKit.getState()
  const next = settle(previous, {}, now)
  if (next.liveness !== previous.liveness) useKit.setState(next, true)
}

/** For tests: back to a figure that has seen nothing. */
export function resetKit() {
  useKit.setState(initial, true)
}

/** Schedules the next deadline (the done hold's end); mounted once, beside the conversations. */
export function useKitClock() {
  const doneUntil = useKit((state) => state.doneUntil)
  useEffect(() => {
    const wait = doneUntil - Date.now()
    if (wait <= 0) return
    const timer = setTimeout(() => tickKit(), wait)
    return () => clearTimeout(timer)
  }, [doneUntil])
}

/** The part of an assistant-ui thread runtime Kit reads. */
interface ThreadSource {
  readonly thread: {
    getState: () => {
      readonly messages: readonly ThreadMessage[]
      readonly isRunning: boolean
    }
    subscribe: (callback: () => void) => () => void
  }
}

/** Reports one conversation's runtime to Kit for as long as it is mounted. */
export function useKitSource(runtime: ThreadSource) {
  const key = useId()
  useEffect(() => {
    const publish = () => {
      const { messages, isRunning } = runtime.thread.getState()
      reportKit(key, kitFactsOf(messages, isRunning))
    }
    publish()
    const unsubscribe = runtime.thread.subscribe(publish)
    return () => {
      unsubscribe()
      forgetKit(key)
    }
  }, [key, runtime])
}
