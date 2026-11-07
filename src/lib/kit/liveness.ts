// SOURCING: hand-rolled. Kit's liveness is the figure's table in Theorem's docs/plans/particle-field/ADDENDUM-2-PARTICLE-FIELD-FIGURE.md §2, derived from run facts only; the poses and their allowed sets mirror agpui_contract::field::expression (PoseId, allowed_poses, default_pose), pounce included

/** What the agent is doing, from run truth and nothing the agent says. */
export type Liveness = 'idle' | 'attend' | 'work' | 'ask' | 'done'

export type Pose =
  | 'rest'
  | 'lean_in'
  | 'think'
  | 'nod'
  | 'tilt'
  | 'shrug'
  | 'wave'
  | 'point'
  | 'stretch'
  | 'celebrate'
  | 'sit'
  | 'sway'
  | 'pounce'

/** The poses each liveness may take, its default first. */
export const ALLOWED_POSES: Record<Liveness, readonly [Pose, ...Pose[]]> = {
  idle: ['rest', 'sway', 'stretch', 'think', 'tilt', 'sit', 'pounce'],
  attend: ['lean_in', 'tilt'],
  work: ['lean_in', 'think', 'point'],
  ask: ['tilt', 'shrug'],
  done: ['nod', 'celebrate', 'stretch', 'wave', 'pounce'],
}

const POSES = new Set<string>(Object.values(ALLOWED_POSES).flat())

/** How long done holds before the figure rests (the addendum's 1.5 s). */
export const DONE_HOLD_MS = 1500

/**
 * How the agent last chose to carry itself: the fields of an accepted
 * `expression` part that a sprite reads. Every field is optional; the wire
 * names only what changed.
 */
export interface KitExpression {
  readonly pose?: Pose
  readonly energy?: number
  readonly breath?: number
  readonly tilt?: number
  readonly gaze?: readonly [number, number]
  readonly hue?: number
}

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/**
 * An expression from the wire: an `expression` part's data, or a thread
 * snapshot's `figureExpression`. Anything that is not an object reads as none.
 */
export function readExpression(value: unknown): KitExpression | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined
  const fields = value as Record<string, unknown>
  const pose =
    typeof fields.pose === 'string' && POSES.has(fields.pose)
      ? (fields.pose as Pose)
      : undefined
  const gaze = Array.isArray(fields.gaze) ? fields.gaze.map(finite) : []
  const [x, y] = gaze
  return {
    ...(pose && { pose }),
    ...(finite(fields.energy) !== undefined && {
      energy: finite(fields.energy),
    }),
    ...(finite(fields.breath) !== undefined && {
      breath: finite(fields.breath),
    }),
    ...(finite(fields.tilt) !== undefined && { tilt: finite(fields.tilt) }),
    ...(gaze.length === 2 &&
      x !== undefined &&
      y !== undefined && { gaze: [x, y] as const }),
    ...(finite(fields.hue) !== undefined && { hue: finite(fields.hue) }),
  }
}

/** The facts liveness is derived from, gathered across every live conversation. */
export interface LivenessFacts {
  /** Some run has a question for the person: an approval it is waiting on. */
  readonly asking: boolean
  readonly running: boolean
  /** The person is in a composer. */
  readonly attending: boolean
  /** When the done hold ends, as epoch milliseconds; 0 when there is none. */
  readonly doneUntil: number
}

/** Asking outranks working (a run waiting on the person is still running), and done holds before attend. */
export function livenessOf(facts: LivenessFacts, now: number): Liveness {
  if (facts.asking) return 'ask'
  if (facts.running) return 'work'
  if (now < facts.doneUntil) return 'done'
  if (facts.attending) return 'attend'
  return 'idle'
}

/** The pose the figure takes: the chosen one when this liveness allows it, its default otherwise. */
export function resolvePose(
  expression: KitExpression | undefined,
  liveness: Liveness,
): Pose {
  const allowed = ALLOWED_POSES[liveness]
  const chosen = expression?.pose
  return chosen && allowed.includes(chosen) ? chosen : allowed[0]
}
