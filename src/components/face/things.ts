// SOURCING: WAI-ARIA disclosure (a control that folds something away says so with aria-expanded="false", and pressing it opens it: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/), which is how a thing is opened here without its component knowing the face exists; the DOM's own measures (getBoundingClientRect, Range.getClientRects for words inside an element, open shadow roots as @pierre/diffs renders a diff's lines into, with `data-line` on each: node_modules/@pierre/diffs/dist/utils/processLine.js) and Element.scrollIntoView for bringing a thing to the person; lib/kit/stage.ts `showing` for what counts as on the page. The names are attributes the page's own components set (`data-face-thing`), so nothing here knows a tool card from a message.
import { overlap, pick, whereOf } from '@/lib/face/things'
import type { Box, Found, ThingSeen } from '@/lib/face/things'
import type { Thing } from '@/lib/face/program'

/** On an element: the name the agent calls it by, as `kind:id`. */
export const THING_ATTRIBUTE = 'data-face-thing'
/** The most things the agent is told of: the newest. */
const MOST = 40
/** A found thing is looked for again this often, in milliseconds; its box is measured every frame. */
const AGAIN = 400
/** The most text searched for a phrase, in characters. */
const SEARCHED = 400_000

interface Named {
  readonly name: string
  readonly label?: string
  readonly state?: string
  readonly element: HTMLElement
}

const boxOf = (rect: DOMRect): Box => ({
  left: rect.left,
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
})

/** Whether an element takes any room on the page. */
function boxed(element: Element) {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 || rect.height > 0
}

/** Every named thing on the page, in the order the page has them. */
function named(): Array<Named> {
  return [
    ...document.querySelectorAll<HTMLElement>(`[${THING_ATTRIBUTE}]`),
  ].flatMap((element) => {
    const name = element.getAttribute(THING_ATTRIBUTE)
    if (!name || !name.includes(':') || element.closest('[inert]')) return []
    const label = element.dataset.faceLabel?.slice(0, 80)
    const state = element.dataset.faceState
    return [
      {
        name,
        element,
        ...(label ? { label } : {}),
        ...(state ? { state } : {}),
      },
    ]
  })
}

/**
 * The element a name means: the newest that fits. Drawn more than once, the
 * one that shows the whole of it before one that shows a part, and one that
 * takes room before one that does not.
 */
function elementOf(name: string): Named | undefined {
  const all = named()
  const chosen = pick(all, name)
  if (!chosen) return undefined
  const same = all.filter(
    (thing) => thing.name === chosen.name && boxed(thing.element),
  )
  return (
    same.findLast((thing) => thing.element.hasAttribute('data-face-whole')) ??
    same.at(-1) ??
    chosen
  )
}

/** What holds a thing that takes no room: the nearest thing around it that says it does, and shows. */
function holderOf(element: Element): HTMLElement | undefined {
  let holder = element.parentElement?.closest<HTMLElement>('[data-face-holder]')
  while (holder && !boxed(holder))
    holder = holder.parentElement?.closest<HTMLElement>('[data-face-holder]')
  return holder ?? undefined
}

/** An element's parent, out through a shadow root to its host. */
function parentOf(node: Node): Element | undefined {
  if (node.parentElement) return node.parentElement
  const root = node.getRootNode()
  return root instanceof ShadowRoot ? root.host : undefined
}

/** The scrollers and clips an element sits inside, nearest first. */
function clipsOf(element: Element): Array<Element> {
  const clips: Array<Element> = []
  for (
    let above = parentOf(element);
    above && above !== document.documentElement;
    above = parentOf(above)
  ) {
    if (above === document.body) break
    const { overflowX, overflowY } = getComputedStyle(above)
    // Unstyled, an element clips nothing, whatever word its style has for that.
    if ([overflowX, overflowY].some((way) => way !== '' && way !== 'visible'))
      clips.push(above)
  }
  return clips
}

/** Every element under a root, into open shadow roots. */
function* elementsIn(root: ParentNode): Generator<Element> {
  if (root instanceof Element && root.shadowRoot)
    yield* elementsIn(root.shadowRoot)
  for (const element of root.querySelectorAll('*')) {
    yield element
    if (element.shadowRoot) yield* elementsIn(element.shadowRoot)
  }
}

/** The text nodes under a root, into open shadow roots, in the order they read. */
function textIn(root: Node, out: Array<Text>, budget: { left: number }) {
  if (root instanceof Element && root.shadowRoot)
    textIn(root.shadowRoot, out, budget)
  for (const child of root.childNodes) {
    if (budget.left <= 0) return
    if (child.nodeType === Node.TEXT_NODE) {
      out.push(child as Text)
      budget.left -= (child as Text).data.length
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as Element
      if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') continue
      textIn(element, out, budget)
    }
  }
}

/** Where some words begin and end among an element's text nodes. */
export interface Span {
  readonly start: Text
  readonly startOffset: number
  readonly end: Text
  readonly endOffset: number
}

const spaces = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * The first place some words appear in an element, however its text is cut
 * into nodes: as written first, then whatever the case. Runs of white space
 * count as one space on both sides, since a line break in the page is a
 * space to whoever quotes it.
 */
export function spanOf(root: Node, words: string): Span | undefined {
  const wanted = spaces(words)
  if (!wanted) return undefined
  const nodes: Array<Text> = []
  textIn(root, nodes, { left: SEARCHED })
  // The text as read, and for each character of it where it came from.
  let read = ''
  const from: Array<{ node: Text; offset: number }> = []
  let spaced = true
  for (const node of nodes) {
    const { data } = node
    for (let offset = 0; offset < data.length; offset++) {
      const letter = data.charAt(offset)
      const white = /\s/.test(letter)
      if (white && spaced) continue
      read += white ? ' ' : letter
      from.push({ node, offset })
      spaced = white
    }
  }
  let begin = read.indexOf(wanted)
  if (begin < 0) begin = read.toLowerCase().indexOf(wanted.toLowerCase())
  const first = from[begin]
  const last = from[begin + wanted.length - 1]
  if (begin < 0 || !first || !last) return undefined
  return {
    start: first.node,
    startOffset: first.offset,
    end: last.node,
    endOffset: last.offset + 1,
  }
}

/** The box of a span's first line. */
function spanBox(span: Span): Box | undefined {
  const range = document.createRange()
  range.setStart(span.start, span.startOffset)
  // Words that run from one tree into another are marked as far as the first runs.
  if (span.end.getRootNode() === span.start.getRootNode())
    range.setEnd(span.end, span.endOffset)
  else range.setEnd(span.start, span.start.data.length)
  const rects = [...range.getClientRects()].filter(
    (rect) => rect.width > 0 && rect.height > 0,
  )
  const first = rects.at(0)
  if (!first) return undefined
  return rects
    .filter((rect) => Math.abs(rect.top - first.top) < 3)
    .reduce<Box>(
      (box, rect) => ({
        left: Math.min(box.left, rect.left),
        top: Math.min(box.top, rect.top),
        right: Math.max(box.right, rect.right),
        bottom: Math.max(box.bottom, rect.bottom),
      }),
      boxOf(first),
    )
}

/** A numbered line of a thing: what was added before what was there, before what was taken away. */
const LINE_ORDER = ['change-addition', 'context', 'context-expanded']

function lineOf(root: Element, line: number): Element | undefined {
  let best: Element | undefined
  let rank = Infinity
  for (const element of elementsIn(root)) {
    if (element.getAttribute('data-line') !== String(line)) continue
    // The number in the gutter is not the line.
    if (element.hasAttribute('data-column-number')) continue
    const order = LINE_ORDER.indexOf(
      element.getAttribute('data-line-type') ?? '',
    )
    const ranked = order < 0 ? LINE_ORDER.length : order
    if (ranked < rank) {
      best = element
      rank = ranked
    }
  }
  return best
}

interface Hold {
  readonly key: string
  readonly at: number
  readonly thing: Named
  /** What is measured for the thing: itself, or what holds it while it is folded away. */
  readonly shown: HTMLElement
  readonly closed: boolean
  readonly span?: Span
  readonly line?: Element
  readonly clips: Array<Element>
  readonly cover?: Element
}

let held: Hold | undefined

function hold(thing: Thing, now: number): Hold | undefined {
  const key = `${thing.thing}\n${thing.text ?? ''}\n${thing.line ?? ''}`
  if (
    held &&
    held.key === key &&
    now - held.at < AGAIN &&
    held.thing.element.isConnected &&
    held.shown.isConnected
  )
    return held
  held = undefined
  const found = elementOf(thing.thing)
  if (!found) return undefined
  const closed = !boxed(found.element)
  const shown = closed ? holderOf(found.element) : found.element
  if (!shown) return undefined
  const line =
    !closed && thing.line !== undefined
      ? lineOf(found.element, thing.line)
      : undefined
  const span =
    !closed && thing.text !== undefined
      ? spanOf(line ?? found.element, thing.text)
      : undefined
  const inner = span?.start.parentElement ?? line ?? shown
  const clips = clipsOf(inner)
  // The composer floats over the foot of the conversation it belongs to.
  const cover = clips
    .map((clip) => clip.querySelector('[data-face-perch="composer"]'))
    .find((composer) => composer !== null)
  held = {
    key,
    at: now,
    thing: found,
    shown,
    closed,
    clips,
    ...(span ? { span } : {}),
    ...(line ? { line } : {}),
    ...(cover ? { cover } : {}),
  }
  return held
}

function viewOf(clips: ReadonlyArray<Element>, cover: Element | undefined) {
  let view: Box = {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  }
  if (cover) {
    const top = cover.getBoundingClientRect().top
    if (top > view.top) view = { ...view, bottom: Math.min(view.bottom, top) }
  }
  // From the outside in. A clip that is itself out of sight leaves what the
  // person sees as it was: the thing lies beyond that, not inside nothing.
  for (const clip of clips.toReversed()) {
    const within = overlap(view, boxOf(clip.getBoundingClientRect()))
    if (within.bottom <= within.top || within.right <= within.left) break
    view = within
  }
  return view
}

/**
 * What cuts a box off for good: a clip nearer than anything that scrolls,
 * which does not scroll itself, and in which the box does not show. A
 * preview's excerpt is one. Scrolling inside it would move what the person
 * has no way to move back.
 */
function cutOffBy(clips: ReadonlyArray<Element>, box: Box) {
  for (const clip of clips) {
    const overflow = getComputedStyle(clip).overflowY
    if (overflow !== 'hidden' && overflow !== 'clip') return undefined
    if (whereOf(box, boxOf(clip.getBoundingClientRect())) !== 'in view')
      return clip
  }
  return undefined
}

/**
 * Finds a thing on the page and measures it. The finding is kept for a
 * moment, since looking for words is not free; the measuring is done every
 * time, since the page scrolls. `undefined` when nothing on the page has the
 * name.
 */
export function locate(
  thing: Thing,
  now: number = performance.now(),
): Found | undefined {
  const kept = hold(thing, now)
  if (!kept) return undefined
  const spanned = kept.span ? spanBox(kept.span) : undefined
  const lined = kept.line ? boxOf(kept.line.getBoundingClientRect()) : undefined
  const part = spanned ?? lined
  return {
    name: kept.thing.name,
    ...(kept.thing.label ? { label: kept.thing.label } : {}),
    box: boxOf(kept.shown.getBoundingClientRect()),
    ...(part ? { part, partKind: spanned ? 'text' : 'line' } : {}),
    view: viewOf(kept.clips, kept.cover),
    closed: kept.closed,
  }
}

/** Forgets what was found, so the next look is a fresh one. */
export function forget() {
  held = undefined
}

/** The things on the page as the agent reads them: the newest, oldest first. */
export function thingsOnPage(): Array<ThingSeen> {
  const seen = new Map<string, Named>()
  for (const thing of named()) {
    const before = seen.get(thing.name)
    // The same name twice: the one that takes room is the thing.
    if (before && boxed(before.element) && !boxed(thing.element)) continue
    seen.delete(thing.name)
    seen.set(thing.name, thing)
  }
  return [...seen.values()].slice(-MOST).map((thing) => {
    const closed = !boxed(thing.element)
    const shown = closed ? holderOf(thing.element) : thing.element
    const where = !shown
      ? 'closed'
      : closed
        ? 'closed'
        : whereOf(
            boxOf(shown.getBoundingClientRect()),
            viewOf(clipsOf(shown), undefined),
          )
    return {
      name: thing.name,
      ...(thing.label ? { label: thing.label } : {}),
      ...(thing.state ? { state: thing.state } : {}),
      where,
    }
  })
}

/** How many frames a thing is waited on to open before it is brought into view as it is. */
const OPENS_WITHIN = 45
/** The most that is opened to reach one thing: what holds it, it, and a fold inside it. */
const OPENS = 3

/** The control that would open what is folded away under a root, if it has one closed. */
/** A closed disclosure; a menu's button says the same and is not one. */
const CLOSED = '[aria-expanded="false"]:not([aria-haspopup])'
/** The control a thing drawn in part marks as showing the whole of it. */
const WHOLE = '[data-face-opens]'

const controlIn = (root: Element, which: string) =>
  root.matches(which)
    ? (root as HTMLElement)
    : root.querySelector<HTMLElement>(which)

/**
 * Brings a thing to the person, who asked: what folds it away is opened by
 * pressing the control that says it is closed, as the person would, and once
 * the part asked for is there it is scrolled to the middle of what they see.
 * Nothing is pressed twice, so a thing that will not open is left alone.
 */
export function reveal(thing: Thing, smooth: boolean) {
  const asked = thing.text !== undefined || thing.line !== undefined
  const pressed = new Set<Element>()
  // Inside the thing itself one fold is opened for a part, and no more: the
  // words may not be anywhere in it.
  let within = 0
  let frames = 0
  const bring = () => {
    frames++
    forget()
    const kept = hold(thing, performance.now())
    const part = !kept
      ? undefined
      : kept.span
        ? spanBox(kept.span)
        : kept.line
          ? boxOf(kept.line.getBoundingClientRect())
          : undefined
    const cut = kept && part ? cutOffBy(kept.clips, part) : undefined
    const ready =
      kept &&
      !kept.closed &&
      (!asked || kept.span || kept.line !== undefined) &&
      !cut
    if (!ready && frames < OPENS_WITHIN) {
      // Folded away, what holds it opens; there but without the part, it
      // does; the part there but cut off, whatever shows the whole of it.
      const control = !kept
        ? undefined
        : kept.closed
          ? controlIn(kept.shown, CLOSED)
          : controlIn(kept.thing.element, cut ? WHOLE : CLOSED)
      const inside = kept !== undefined && !kept.closed
      if (
        control &&
        !pressed.has(control) &&
        pressed.size < OPENS &&
        !(inside && within > 0)
      ) {
        pressed.add(control)
        if (inside) within++
        control.click()
      }
      requestAnimationFrame(bring)
      return
    }
    if (!kept) return
    // What is cut off for good is brought as near as it comes: what cuts it.
    const target =
      cut ?? kept.span?.start.parentElement ?? kept.line ?? kept.shown
    target.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: smooth ? 'smooth' : 'auto',
    })
    forget()
  }
  requestAnimationFrame(bring)
}
