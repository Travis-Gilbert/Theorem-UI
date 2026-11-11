// SOURCING: lib/kit/stage.ts for how a page names its parts to an agent (an attribute on the element, a kind, a label, and a list the agent reads; names, never coordinates). Hand-rolled: where a figure stands beside a box and what of it is marked. It is a dozen lines of rectangle arithmetic particular to this figure; a positioning library (floating-ui) places a panel against an anchor and keeps it on screen, which is not the question here: the figure must stay out of what it points at, and say which way a thing lies when it cannot be seen.
import type { Thing } from './program'

/** A rectangle on the window, in CSS pixels. */
export interface Box {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** Whether a thing can be seen: showing, scrolled past either way, or folded away inside something closed. */
export type Where = 'in view' | 'above' | 'below' | 'closed'

/** One thing the page has named, as the agent reads it. */
export interface ThingSeen {
  readonly name: string
  readonly label?: string
  /** What became of it, where that is known: `running`, `done`, `failed`. */
  readonly state?: string
  readonly where: Where
}

/** A thing as the page found it. */
export interface Found {
  /** The name it has on the page, which an alias (`tool:failed`) resolves to. */
  readonly name: string
  readonly label?: string
  /** Its own box, or the box of what stands in for it while it is closed. */
  readonly box: Box
  /** The part asked for, when it was found. */
  readonly part?: Box
  /** How the part is marked: words by an underline, a line by a bar. */
  readonly partKind?: 'text' | 'line'
  /** What of the page can be seen around it: the window, less what its scrollers clip and what covers it. */
  readonly view: Box
  /** It is folded away: the box is what holds it. */
  readonly closed: boolean
}

export interface Point {
  readonly x: number
  readonly y: number
}

/** What is marked on the page while the figure points. */
export interface Mark {
  readonly box: Box
  /** The whole thing, the words in it, or a line of it. */
  readonly kind: 'whole' | 'text' | 'line'
}

/** Where the figure stands to point at a thing, and what it points with. */
export interface Standing {
  /** The figure's centre. */
  readonly at: Point
  /** Where on the window its eyes go. */
  readonly look: Point
  readonly where: Where
  /** Nothing is marked that cannot be seen. */
  readonly mark?: Mark
}

/** The kind a thing's name begins with. */
export const kindOf = (name: string) => name.slice(0, name.indexOf(':'))

/** `tool:failed` and `tool:last` name whichever is newest, not one thing. */
export function aliasOf(
  name: string,
): { kind: string; which: 'last' | 'failed' } | undefined {
  const which = name.slice(name.indexOf(':') + 1)
  return which === 'last' || which === 'failed'
    ? { kind: kindOf(name), which }
    : undefined
}

/** The thing a name means among those on the page, oldest first: the newest that fits. */
export function pick<T extends { name: string; state?: string }>(
  things: ReadonlyArray<T>,
  name: string,
): T | undefined {
  const alias = aliasOf(name)
  return things.findLast((thing) =>
    alias
      ? kindOf(thing.name) === alias.kind &&
        (alias.which === 'last' || thing.state === 'failed')
      : thing.name === name,
  )
}

/** A name fit to be a thing's: the kind, then an id with nothing in it a name cannot hold. */
export const thingName = (kind: string, id: string) =>
  `${kind}:${id.replace(/[^A-Za-z0-9_.:/@-]/g, '-').slice(0, 120)}`

/**
 * The attributes that name an element to the face, for a component to spread
 * on what it draws: the agent can then send the face to it.
 */
export function thingProps(
  kind: string,
  id: string,
  about: {
    label?: string | undefined
    state?: string | undefined
    /** This is the whole of the thing, where another element shows a part of it: the face goes here while both are on the page. */
    whole?: boolean
  } = {},
) {
  return {
    'data-face-thing': thingName(kind, id),
    ...(about.label ? { 'data-face-label': about.label.slice(0, 80) } : {}),
    ...(about.state ? { 'data-face-state': about.state } : {}),
    ...(about.whole ? { 'data-face-whole': '' } : {}),
  }
}

/**
 * On the control that shows the whole of a thing drawn in part (a preview's
 * "open" button): the person's tap on the face presses it when what the face
 * points at is cut off.
 */
export const OPENS_WHOLE = { 'data-face-opens': '' } as const

/** What became of a tool call, in the words a thing's state is given in. */
export function toolState(
  status: { type: string; reason?: string } | undefined,
  isError?: boolean,
) {
  if (isError) return 'failed'
  switch (status?.type) {
    case 'running':
      return 'running'
    case 'requires-action':
      return 'waiting'
    case 'incomplete':
      return status.reason === 'cancelled' ? 'cancelled' : 'failed'
    case 'complete':
      return 'done'
    default:
      return undefined
  }
}

const height = (box: Box) => box.bottom - box.top
const width = (box: Box) => box.right - box.left

export const overlap = (one: Box, two: Box): Box => ({
  left: Math.max(one.left, two.left),
  top: Math.max(one.top, two.top),
  right: Math.min(one.right, two.right),
  bottom: Math.min(one.bottom, two.bottom),
})

/** Some of the box shows in the view. */
const SHOWS = 6

/** Whether a box shows in a view, or which way it lies. */
export function whereOf(box: Box, view: Box): 'in view' | 'above' | 'below' {
  const needs = Math.min(SHOWS, height(box))
  if (box.bottom - needs < view.top) return 'above'
  if (box.top + needs > view.bottom) return 'below'
  return 'in view'
}

/** Between the figure and what it stands beside. */
const GAP = 12
/** A thing taller than this is pointed at by its head, not its middle. */
const HEAD = 36
/** How far off the eyes look for something that cannot be seen. */
const BEYOND = 220

/**
 * Where the figure stands to point. Beside the thing, outside its box, on the
 * side the part is nearer when there is room there; level with the part.
 * With no room either side it sits over the thing, just above the part. A
 * thing out of view has the figure at the edge it lies beyond, looking that
 * way.
 */
export function stand(
  found: Found,
  size: { width: number; height: number },
  page: { width: number; height: number },
  margin: number,
): Standing {
  const { box, view } = found
  const target = found.closed ? box : (found.part ?? box)
  const lies = whereOf(target, view)
  const where = lies === 'in view' && found.closed ? 'closed' : lies

  const room = size.width + GAP + margin
  const rightRoom = page.width - box.right >= room
  const leftRoom = box.left >= room
  const middle = (target.left + target.right) / 2
  const nearerLeft = middle - box.left < box.right - middle
  const side =
    rightRoom && leftRoom
      ? nearerLeft
        ? 'left'
        : 'right'
      : rightRoom
        ? 'right'
        : leftRoom
          ? 'left'
          : 'over'
  const x =
    side === 'right'
      ? box.right + GAP + size.width / 2
      : side === 'left'
        ? box.left - GAP - size.width / 2
        : Math.min(
            Math.max(target.right + GAP + size.width / 2, box.left + room / 2),
            box.right - GAP - size.width / 2,
          )

  // A tall thing is pointed at by its head; a line or a phrase by its middle.
  const level =
    target.top + (height(target) > HEAD * 2 ? HEAD : height(target) / 2)
  const highest = view.top + size.height / 2 + 4
  const lowest = Math.max(highest, view.bottom - size.height / 2 - 4)
  if (lies !== 'in view') {
    const y = lies === 'above' ? highest + 4 : lowest - 4
    return {
      at: { x, y },
      look: { x, y: y + (lies === 'above' ? -BEYOND : BEYOND) },
      where,
    }
  }
  const y =
    side === 'over'
      ? Math.max(highest, target.top - size.height / 2 - 8)
      : Math.min(Math.max(level, highest), lowest)
  const shown = overlap(target, view)
  const whole = found.closed || !found.part
  return {
    at: { x, y },
    look: {
      x: whole
        ? side === 'left'
          ? Math.min(box.left + HEAD * 2, middle)
          : side === 'right'
            ? Math.max(box.right - HEAD * 2, middle)
            : middle
        : middle,
      y: Math.min(Math.max(level, shown.top), shown.bottom),
    },
    where,
    ...(width(shown) > 0 && height(shown) > 0
      ? {
          mark: {
            box: shown,
            kind: whole ? 'whole' : (found.partKind ?? 'text'),
          },
        }
      : {}),
  }
}

/** What the agent is told when a thing it named is not simply there to point at. */
export function noteOf(thing: Thing, found: Found, where: Where) {
  const asked = thing.text !== undefined || thing.line !== undefined
  const notes: Array<string> = []
  if (found.closed)
    notes.push(
      `${found.name} is folded away; the face points at what holds it, and the person’s tap on the face opens it.`,
    )
  else if (asked && !found.part)
    notes.push(
      thing.line !== undefined
        ? `${found.name} shows no line ${thing.line}; the face points at the whole of it.`
        : `The words were not found in ${found.name}; the face points at the whole of it.`,
    )
  if (where === 'above' || where === 'below')
    notes.push(
      `${found.name} is ${where} what the person sees; the face waits at that edge, and their tap on it brings the thing into view.`,
    )
  return notes
}
