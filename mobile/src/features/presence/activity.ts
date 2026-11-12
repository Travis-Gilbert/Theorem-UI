// SOURCING: the description of Platinum's `crates/presence` given with the owner's request of 2026-11-12 (activity id, generation, revision, phase, standing, preferred form, signals with freshness, available actions; stale generations refused; hiding never cancels work; stop is explicit). The Platinum repository was not readable from here, so field names and the value sets of `phase`, `standing` and `form` are the phone's reading of that description and must be compared with the source (docs/plans/theo-iphone.md, owner decisions).
//
// One activity: a piece of real work Theo is present for, on some device.
// The phone shows activities; it never invents one. Every record says where
// the work runs, so an action is never aimed at the wrong machine.
import type { Liveness } from '../theo/core'

/** Where the work happens. An operation names one of these, always. */
export type Environment =
  | { kind: 'theorem'; authority: string }
  | { kind: 'iphone'; deviceId: string }
  | { kind: 'computer'; computerId: string; name: string }

export type Phase = 'pending' | 'working' | 'waiting' | 'done' | 'failed' | 'stopped'

/** Whether the person is owed anything. */
export type Standing = 'needs-you' | 'in-hand' | 'settled'

/** A measured or reported value, with when it was observed. Never estimated. */
export type Signal = { name: string; value: number | string; observedAtMs: number }

/** What the person can do to the work itself. Hiding is not one: it changes only this phone's display. */
export type Action = 'open' | 'answer' | 'steer' | 'stop'

export type Activity = {
  activityId: string
  /** Raised by the work's owner when it starts the activity over. A lower one is refused. */
  generation: number
  /** Rises with every change inside a generation. */
  revision: number
  environment: Environment
  title: string
  /** One plain line about what is happening, from the work's owner. */
  status: string
  phase: Phase
  standing: Standing
  /** The device form that describes the work, when its owner names one. */
  preferredForm?: 'eyes' | 'camera' | 'document' | 'screen' | 'task'
  signals: Signal[]
  actions: Action[]
}

export type Verdict = { accepted: true; activity: Activity } | { accepted: false; reason: 'stale-generation' | 'stale-revision' | 'other-activity' }

/** An update replaces what is shown only if it is newer. A stale one changes nothing. */
export function accept(current: Activity | undefined, incoming: Activity): Verdict {
  if (!current) return { accepted: true, activity: incoming }
  if (incoming.activityId !== current.activityId) return { accepted: false, reason: 'other-activity' }
  if (incoming.generation < current.generation) return { accepted: false, reason: 'stale-generation' }
  if (incoming.generation === current.generation && incoming.revision <= current.revision)
    return { accepted: false, reason: 'stale-revision' }
  return { accepted: true, activity: incoming }
}

/** A signal older than this is shown as old, or not at all. */
export const FRESH_MS = 30_000

export const fresh = (signal: Signal, nowMs: number, withinMs = FRESH_MS) =>
  nowMs - signal.observedAtMs <= withinMs

export const isOngoing = (activity: Activity) =>
  activity.phase === 'pending' || activity.phase === 'working' || activity.phase === 'waiting'

/** An action is only offered while the record lists it and the work is not over. */
export const can = (activity: Activity, action: Action) =>
  activity.actions.includes(action) && (action === 'open' || isOngoing(activity))

/** The face's liveness for an activity: the same five the web face settles into. */
export function livenessOf(activity: Activity | undefined): Liveness {
  if (!activity) return 'idle'
  switch (activity.phase) {
    case 'pending':
      return 'attend'
    case 'working':
      return 'work'
    case 'waiting':
      return 'ask'
    case 'done':
      return 'done'
    default:
      return 'idle'
  }
}

/**
 * What this phone shows, apart from the work. Hiding an activity removes it
 * from the phone's surfaces until it changes; it is not sent anywhere and
 * stops nothing.
 */
export class Shown {
  private readonly hiddenAt = new Map<string, string>()
  private static mark = (activity: Activity) => `${activity.generation}:${activity.revision}:${activity.phase}`

  hide(activity: Activity): void {
    this.hiddenAt.set(activity.activityId, Shown.mark(activity))
  }

  /** Hidden until the work's phase or generation moves on. */
  visible(activity: Activity): boolean {
    const mark = this.hiddenAt.get(activity.activityId)
    if (mark === undefined) return true
    const [generation, , phase] = mark.split(':')
    return String(activity.generation) !== generation || activity.phase !== phase
  }
}
