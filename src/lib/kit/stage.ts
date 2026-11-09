// SOURCING: zustand, as lib/kit/store; surfaces are DOM elements the shell marks with data-kit-perch (and data-kit-label), measured with getBoundingClientRect, a message's only while its top shows inside the scroller marked data-kit-clip; the sheet's `feet` slice (row 27 of 32) is where Kit stands; Theorem's KitScene, KitSurface and KitTouch for what the scene reports. Hand-rolled: where a figure stands on an element's edge and which edge catches it when it falls is this app's own geometry, which no library models (the physics in lib/kit/physics works from these lines).
import { create } from 'zustand'
import type { KitGait } from './contract/KitGait'
import type { KitScene } from './contract/KitScene'
import type { KitStepOutcome } from './contract/KitStepOutcome'
import type { KitSurface } from './contract/KitSurface'
import type { KitSurfaceKind } from './contract/KitSurfaceKind'
import type { KitTouchKind } from './contract/KitTouchKind'
import type { Act } from './director'
import type { KitTag } from './sheet'

/**
 * Where Kit can stand, by surface id. Each is an element in the shell marked
 * `data-kit-perch`: the composer's box (Kit stands on its top edge), the
 * rail's slot at its foot, each message showing in the conversation
 * (`message:<id>`, on its top edge), and the floor of the window, which is
 * always there.
 */
export const FIXED_SURFACES = ['composer', 'rail', 'floor'] as const
export type PerchName = string

/** The most messages offered as surfaces at once, nearest the bottom first kept. */
const MAX_MESSAGE_SURFACES = 16
/** The longest label a surface carries in the scene. */
const MAX_LABEL = 80

/** The surface id of a message, as Theorem's contract admits it. */
export const messageSurface = (id: string) =>
  `message:${id.replace(/[^A-Za-z0-9_.:-]/g, '-').slice(0, 120)}`

/** What kind of surface an id names. */
export const surfaceKind = (id: PerchName): KitSurfaceKind =>
  id.startsWith('message:') ? 'message' : (id as KitSurfaceKind)

/** A short label for a message surface: whose it is and its first words. */
export function messageLabel(role: string, text: string): string {
  const who = role === 'assistant' ? 'your reply' : 'their message'
  const words = text.replace(/\s+/g, ' ').trim()
  const room = MAX_LABEL - who.length - 2
  const shown =
    words.length > room ? `${words.slice(0, room - 1).trimEnd()}…` : words
  return shown ? `${who}: ${shown}` : who
}

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

/** The person's last touch: a tap, a carry, or a throw, and where Kit came to rest. */
export interface Touch {
  readonly kind: KitTouchKind
  readonly onto: PerchName
  readonly at: number
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
  /** The person's last touch, until a receipt reports it to the run. */
  readonly touched: Touch | undefined
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
  touched: undefined,
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

/**
 * Whether a marked element shows now: it has a size and, inside a scroller
 * marked `data-kit-clip`, its top edge is within the scroller's view.
 */
function showing(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const clip = element.closest<HTMLElement>('[data-kit-clip]')
  if (!clip) return true
  const view = clip.getBoundingClientRect()
  // Kit draws above the page, so its head may cross the scroller's top edge.
  return rect.top >= view.top && rect.top <= view.bottom - 4
}

const surfaceSelector = (name: PerchName) =>
  `[data-kit-perch="${name.replace(/["\\]/g, '')}"]`

/** The element the shell marked as this surface, when one is showing. */
export function perchElement(name: PerchName): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined
  for (const element of document.querySelectorAll<HTMLElement>(
    surfaceSelector(name),
  ))
    if (showing(element)) return element
  return undefined
}

/** The ids of the message surfaces showing now, in the conversation's order. */
function messageSurfaces(): PerchName[] {
  if (typeof document === 'undefined') return []
  const ids = [
    ...document.querySelectorAll<HTMLElement>('[data-kit-perch^="message:"]'),
  ]
    .filter(showing)
    .map((element) => element.dataset.kitPerch as PerchName)
  return [...new Set(ids)].slice(-MAX_MESSAGE_SURFACES)
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

/** Every surface showing now: the composer, the rail, the messages, and the floor last. */
export function perchLines(): PerchLine[] {
  return ['composer', 'rail', ...messageSurfaces(), 'floor']
    .map(perchLine)
    .filter((line): line is PerchLine => line !== undefined)
}

/** The surfaces on screen as the scene names them, with their labels. */
export function surfacesOf(lines: readonly PerchLine[]): KitSurface[] {
  return lines.map(({ name }) => {
    const label = perchElement(name)?.dataset.kitLabel?.slice(0, MAX_LABEL)
    return { id: name, kind: surfaceKind(name), ...(label && { label }) }
  })
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
  steps?: readonly KitStepOutcome[],
): Scene {
  const saying =
    state.speech && state.speech.until > now ? state.speech.text : undefined
  const { touched } = state
  return {
    perch: state.perch,
    at: Math.round(state.at * 100) / 100,
    facing: state.facing === 1 ? 'right' : 'left',
    doing,
    ...(saying && { saying }),
    surfaces: surfacesOf(perchLines()),
    ...(touched && {
      touched: {
        kind: touched.kind,
        onto: touched.onto,
        agoMs: Math.max(0, now - touched.at),
      },
    }),
    ...(steps && { steps: [...steps] }),
    revision: state.revision,
  }
}
