// SOURCING: hand-rolled. The figure's own choices within the liveness its run allows: Theorem's ADDENDUM-1 (one unprompted shift per 20 s while idle) and ADDENDUM-2 §2 (each liveness's default and allowed set; pounce is the figure's flourish for idle and done), timed on the deadline clock rather than animation frames (ADDENDUM-2 §4)
import { ALLOWED_POSES } from './liveness'
import type { Liveness, Pose } from './liveness'
import { KIT_SHEET, tagLength } from './sheet'
import type { KitTag } from './sheet'

/** What the figure is playing now and why. */
export interface Act {
  /** The sheet tag the sprite plays. */
  readonly tag: KitTag
  /** The liveness and pose this act was chosen for. */
  readonly liveness: Liveness
  readonly pose: Pose
  /** When it began, as epoch milliseconds. */
  readonly since: number
  /** When the figure chooses again; Infinity when only a new fact changes it. */
  readonly until: number
  /** Plays one pass and holds its last frame. */
  readonly once: boolean
  /** The figure's own flourish, not the pose its liveness or the agent set. */
  readonly unprompted: boolean
}

/** At most one unprompted shift in this long (ADDENDUM-1's rate). */
export const SHIFT_MS = 20_000
/** How much later than the earliest admission an idle shift may come. */
const SHIFT_JITTER_MS = 15_000
/** How long a looping idle shift holds before the figure goes back to its pose. */
const SHIFT_HOLD_MS = [6_000, 10_000] as const
/** Idle this long, a shift may be sleep, which lasts until something happens. */
export const SLEEP_AFTER_MS = 180_000

/** Poses that play one pass and hold, rather than loop. */
const ONCE: ReadonlySet<KitTag> = new Set<KitTag>(['nod', 'stretch', 'pounce'])

/** What the figure knows when it chooses. */
export interface Stage {
  readonly liveness: Liveness
  /** The pose the run allows and the agent chose, as `resolvePose` gives it. */
  readonly pose: Pose
  /** The agent's expression picked this pose, rather than the default. */
  readonly chosen: boolean
  /** When the last unprompted shift began, as epoch milliseconds. */
  readonly lastShift: number
  /** When the figure last became idle, as epoch milliseconds. */
  readonly idleSince: number
}

const pick = <T>(items: readonly T[], random: () => number): T | undefined =>
  items[Math.floor(random() * items.length)]

/** The pose itself: what the figure does when it chooses nothing more. */
export function poseAct(stage: Stage, now: number, random: () => number): Act {
  const idle = stage.liveness === 'idle'
  return {
    tag: stage.pose,
    liveness: stage.liveness,
    pose: stage.pose,
    since: now,
    until: idle ? now + SHIFT_MS + random() * SHIFT_JITTER_MS : Infinity,
    once: ONCE.has(stage.pose),
    unprompted: false,
  }
}

function flourish(
  tag: KitTag,
  stage: Stage,
  now: number,
  random: () => number,
): Act {
  const once = ONCE.has(tag)
  const [least, most] = SHIFT_HOLD_MS
  const until = once
    ? now + tagLength(KIT_SHEET, tag)
    : tag === 'sleep'
      ? Infinity
      : now + least + random() * (most - least)
  return {
    tag,
    liveness: stage.liveness,
    pose: stage.pose,
    since: now,
    until,
    once,
    unprompted: true,
  }
}

/**
 * The act that follows `act` once the stage is what it is at `now`. The
 * liveness and the agent's pose always win: a new one ends whatever was
 * playing, except that a flourish begun while done lands as done gives way to
 * idle. Within a pose the figure may shift on its own, at most once per
 * `SHIFT_MS`: when a turn is done and the agent chose nothing, into one of
 * done's flourishes; while idle, into another idle pose, or after a long idle,
 * to sleep.
 */
export function nextAct(
  act: Act,
  stage: Stage,
  now: number,
  random: () => number,
): Act {
  const same = act.liveness === stage.liveness && act.pose === stage.pose
  const landing =
    act.unprompted &&
    act.liveness === 'done' &&
    stage.liveness === 'idle' &&
    now < act.until
  if (landing || (same && now < act.until)) return act
  const admitted = now - stage.lastShift >= SHIFT_MS
  if (!same && stage.liveness === 'done' && !stage.chosen && admitted) {
    const flourishes = ALLOWED_POSES.done.filter((pose) => pose !== stage.pose)
    const tag = random() < 0.5 ? pick(flourishes, random) : undefined
    if (tag) return flourish(tag, stage, now, random)
  }
  if (same && stage.liveness === 'idle' && !act.unprompted && admitted) {
    const sleepy = now - stage.idleSince >= SLEEP_AFTER_MS && random() < 0.4
    const shifts = ALLOWED_POSES.idle.filter((pose) => pose !== stage.pose)
    const tag = sleepy ? 'sleep' : pick(shifts, random)
    if (tag) return flourish(tag, stage, now, random)
  }
  return poseAct(stage, now, random)
}
