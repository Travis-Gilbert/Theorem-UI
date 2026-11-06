// SOURCING: zustand, as lib/life/store; the deadline timer is the addendum's semantic clock (ADDENDUM-2 §4: the done hold and the idle shifts come due on a timer scheduled for the next deadline, independent of any animation frame)
import { useEffect, useId } from 'react'
import { create } from 'zustand'
import {
  DONE_HOLD_MS,
  livenessOf,
  readExpression,
  resolvePose,
} from './liveness'
import type { KitExpression, Liveness, Pose } from './liveness'
import { nextAct, poseAct } from './director'
import type { Act, Stage } from './director'
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
  /** What the sprite plays: the pose, or a flourish the figure chose itself. */
  readonly act: Act
  /** When the figure's last unprompted shift began, as epoch milliseconds. */
  readonly lastShift: number
  /** When the figure last became idle, as epoch milliseconds. */
  readonly idleSince: number
}

const initial: KitState = {
  sources: {},
  attending: false,
  doneUntil: 0,
  liveness: 'idle',
  expression: undefined,
  pose: 'rest',
  appliedPartId: undefined,
  // Not yet started: resting until the clock wakes it (`wakeKit`) or a fact
  // arrives, so nothing shifts before the figure is on screen.
  act: {
    tag: 'rest',
    liveness: 'idle',
    pose: 'rest',
    since: 0,
    until: Infinity,
    once: false,
    unprompted: false,
  },
  lastShift: 0,
  idleSince: 0,
}

/** Where the figure's own choices draw their chance; tests make it repeatable. */
let random: () => number = Math.random

export const useKit = create<KitState>(() => initial)

const any = (sources: KitState['sources'], fact: 'running' | 'asking') =>
  Object.values(sources).some((source) => source[fact])

/**
 * Recomputes what follows from the facts: a turn ending starts the done hold,
 * and the act follows the liveness and pose, or a due deadline.
 */
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
  const pose = resolvePose(state.expression, liveness)
  const idleSince =
    liveness === 'idle' && previous.liveness !== 'idle' ? now : state.idleSince
  const stage: Stage = {
    liveness,
    pose,
    chosen: state.expression?.pose === pose,
    lastShift: state.lastShift,
    idleSince,
  }
  const act = nextAct(state.act, stage, now, random)
  return {
    ...state,
    doneUntil,
    liveness,
    pose,
    act,
    lastShift:
      act !== state.act && act.unprompted ? act.since : state.lastShift,
    idleSince,
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

/**
 * Advances the clock: the done hold expires into whatever the facts say now,
 * and an act whose time is up gives way to the figure's next choice.
 */
export function tickKit(now = Date.now()) {
  const previous = useKit.getState()
  const next = settle(previous, {}, now)
  if (next.liveness !== previous.liveness || next.act !== previous.act)
    useKit.setState(next, true)
}

/** Starts the figure's own clock, once, when it is first on screen. */
export function wakeKit(now = Date.now()) {
  const state = useKit.getState()
  if (state.act.since !== 0) return
  const stage: Stage = {
    liveness: state.liveness,
    pose: state.pose,
    chosen: state.expression?.pose === state.pose,
    lastShift: state.lastShift,
    idleSince: now,
  }
  useKit.setState(
    { ...state, act: poseAct(stage, now, random), idleSince: now },
    true,
  )
}

/** For tests: back to a figure that has seen nothing, with its chance fixed if given. */
export function resetKit(options: { random?: () => number } = {}) {
  random = options.random ?? Math.random
  useKit.setState(initial, true)
}

/**
 * Schedules the next deadline (the done hold's end, or the act's), and wakes
 * the figure; mounted once, beside the conversations.
 */
export function useKitClock() {
  const doneUntil = useKit((state) => state.doneUntil)
  const actUntil = useKit((state) => state.act.until)
  useEffect(() => wakeKit(), [])
  useEffect(() => {
    const now = Date.now()
    const due = Math.min(
      ...[doneUntil, actUntil].filter((deadline) => deadline > now),
    )
    if (!Number.isFinite(due)) return
    // A timer may fire a moment before the wall clock reads the deadline;
    // it was due, so the tick is at least the deadline.
    const timer = setTimeout(
      () => tickKit(Math.max(Date.now(), due)),
      due - now,
    )
    return () => clearTimeout(timer)
  }, [doneUntil, actUntil])
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
