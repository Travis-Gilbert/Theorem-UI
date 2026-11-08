// SOURCING: zustand, as lib/kit/store; perches are DOM elements the shell marks with data-kit-perch, measured with getBoundingClientRect; the sheet's `feet` slice (row 27 of 32) is where Kit stands. Hand-rolled: where a figure stands on an element's edge and which edge catches it when it falls is this app's own geometry, which no library models.
import { create } from 'zustand'
import type { KitGait } from './contract/KitGait'
import type { KitPerch } from './contract/KitPerch'
import type { KitScene } from './contract/KitScene'
import type { Act } from './director'
import type { KitTag } from './sheet'

/**
 * Where Kit can stand. Each is an element in the shell marked
 * `data-kit-perch`: the composer's box (Kit stands on its top edge), the
 * rail's slot at its foot, and the floor of the window, which is always there.
 */
export const PERCHES = [
  'composer',
  'rail',
  'floor',
] as const satisfies readonly KitPerch[]
export type PerchName = KitPerch

/** How Kit moves when it goes somewhere. */
export type Gait = KitGait

/** What Kit's body is doing apart from its pose: moving, held, or landing. */
export type Motion =
  'still' | 'walk' | 'run' | 'air' | 'fall' | 'held' | 'crouch'

/** The side of a frame, in CSS pixels, as Kit is drawn on the stage. */
export const KIT_SIZE = 32
/** The row of the frame Kit's feet rest on (the sheet's `feet` slice, plus one). */
export const FEET = 28

/** A perch as measured now: the line Kit stands on and how far it reaches. */
export interface PerchLine {
  readonly name: PerchName
  readonly left: number
  readonly right: number
  /** The y Kit's feet rest at. */
  readonly y: number
}

/** A momentary gesture someone asked for: the agent, or the person's tap. */
export interface Gesture {
  readonly tag: KitTag
  readonly since: number
  readonly until: number
  readonly once: boolean
}

export interface Speech {
  readonly text: string
  readonly until: number
}

export interface StageState {
  /** Where Kit stands, or stood last before it was picked up. */
  readonly perch: PerchName
  /** Where along the perch, 0 at its left end and 1 at its right. */
  readonly at: number
  /** 1 faces right, as the sheet is drawn; -1 faces left. */
  readonly facing: 1 | -1
  readonly motion: Motion
  /** When the motion began, as epoch milliseconds, so its frames start there. */
  readonly motionSince: number
  readonly gesture: Gesture | undefined
  readonly speech: Speech | undefined
  /** Whether the stage is mounted and Kit is on screen. */
  readonly mounted: boolean
  /**
   * Counts every change to where Kit is or what it shows, by the agent or the
   * person, so a run's client operations can name the scene they acted on.
   */
  readonly revision: number
}

const initial: StageState = {
  perch: 'composer',
  at: 0.88,
  facing: -1,
  motion: 'still',
  motionSince: 0,
  gesture: undefined,
  speech: undefined,
  mounted: false,
  revision: 0,
}

export const useKitStage = create<StageState>(() => initial)

/** Changes the stage and counts the change; a new motion starts its clock. */
export function changeStage(change: Partial<StageState>, now = Date.now()) {
  useKitStage.setState((state) => ({
    ...change,
    ...(change.motion !== undefined &&
      change.motion !== state.motion && { motionSince: now }),
    revision: state.revision + 1,
  }))
}

/** The body tag each motion plays. */
const MOTION_TAGS: Record<Exclude<Motion, 'still'>, KitTag> = {
  walk: 'walk',
  run: 'run',
  air: 'air',
  fall: 'fall',
  held: 'held',
  crouch: 'crouch',
}

/** What the sprite plays and from when. */
export interface Shown {
  readonly tag: KitTag
  readonly since: number
  readonly once: boolean
}

/**
 * What Kit's sprite shows: its body while it moves or is held, then a
 * gesture someone asked for while it lasts, then the act the director chose
 * from the run's liveness and the agent's pose.
 */
export function shownTag(stage: StageState, act: Act, now = Date.now()): Shown {
  if (stage.motion !== 'still')
    return {
      tag: MOTION_TAGS[stage.motion],
      since: stage.motionSince,
      once: false,
    }
  const gesture = stage.gesture
  if (gesture && gesture.until > now)
    return { tag: gesture.tag, since: gesture.since, once: gesture.once }
  return { tag: act.tag, since: act.since, once: act.once }
}

export function resetKitStage() {
  useKitStage.setState(initial, true)
}

/** The element the shell marked as this perch, when one is showing. */
export function perchElement(name: PerchName): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined
  for (const element of document.querySelectorAll<HTMLElement>(
    `[data-kit-perch="${name}"]`,
  )) {
    const rect = element.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return element
  }
  return undefined
}

/**
 * The line a perch offers, measured now. A perch whose `data-kit-edge` is
 * `bottom` is a slot Kit stands inside (the rail's); any other is a surface
 * Kit stands on top of. The floor is the window's bottom edge.
 */
export function perchLine(name: PerchName): PerchLine | undefined {
  if (name === 'floor') {
    const width = typeof window === 'undefined' ? 0 : window.innerWidth
    const height = typeof window === 'undefined' ? 0 : window.innerHeight
    return { name, left: 0, right: width, y: height - 2 }
  }
  const element = perchElement(name)
  if (!element) return undefined
  const rect = element.getBoundingClientRect()
  const slot = element.dataset.kitEdge === 'bottom'
  return {
    name,
    left: rect.left,
    right: rect.right,
    y: slot ? rect.bottom : rect.top + 1,
  }
}

/** Every perch showing now, the floor last. */
export function perchLines(): PerchLine[] {
  return PERCHES.map(perchLine).filter(
    (line): line is PerchLine => line !== undefined,
  )
}

/**
 * The top-left corner of Kit's frame when it stands `at` along `line`. Kit is
 * kept wholly on the line, so at 0 and 1 its frame meets the line's ends.
 */
export function standPoint(line: PerchLine, at: number): [number, number] {
  const span = Math.max(0, line.right - line.left - KIT_SIZE)
  const x = line.left + span * clamp01(at)
  return [x, line.y - FEET]
}

/** Where along `line` a frame whose left edge is at `x` stands. */
export function atOf(line: PerchLine, x: number): number {
  const span = line.right - line.left - KIT_SIZE
  return span <= 0 ? 0.5 : clamp01((x - line.left) / span)
}

/**
 * The perch that catches Kit when it drops from a frame whose top-left is
 * (x, y): the highest line below its feet that its middle is over. The floor
 * always catches it.
 */
export function landingLine(
  lines: readonly PerchLine[],
  x: number,
  y: number,
): PerchLine | undefined {
  const middle = x + KIT_SIZE / 2
  const feet = y + FEET
  return lines
    .filter(
      (line) =>
        line.y >= feet - 6 &&
        middle >= line.left - 4 &&
        middle <= line.right + 4,
    )
    .sort((a, b) => a.y - b.y)[0]
}

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** What the agent and the person read about where Kit is and what it does: Theorem's `KitScene`. */
export type Scene = KitScene

export function sceneOf(
  state: StageState,
  doing: string,
  now = Date.now(),
): Scene {
  const saying =
    state.speech && state.speech.until > now ? state.speech.text : undefined
  return {
    perch: state.perch,
    at: Math.round(state.at * 100) / 100,
    facing: state.facing === 1 ? 'right' : 'left',
    doing,
    ...(saying && { saying }),
    perches: perchLines().map((line) => line.name),
    revision: state.revision,
  }
}
