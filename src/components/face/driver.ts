// SOURCING: lib/kit/driver.ts for the shape of it (one object that owns a figure's place on the page, its pointer handling and its frame loop, outside React); lib/face/engine for everything the face is; lib/face/body (Rapier) for how the figure travels, is carried, thrown and knocked, loaded on first need, with the glide this file had before it kept for a browser that cannot load it and for reduced motion; lib/world for the world that body is in, which is Kit's too, so a thrown Theo strikes Kit; lib/kit/driver and lib/kit/stage for where Kit is while it is in the air, which the eyes follow; lib/sound/graph for what the page's sound measures as, handed to the face each frame, and the arcs the face emits drawn beside it (docs/plans/theo-sound.md). Anchors are attributes the shell puts on its own elements (`data-face-perch`), found afresh each frame so a perch that scrolls away or unmounts is simply no longer chosen. The gestures (tap, carry, stroke, double-tap home) are this app's.
import { BODY, FaceBody, releaseVelocity } from '@/lib/face/body'
import type { Sample } from '@/lib/face/body'
import { clamp } from '@/lib/face/channels'
import type { Face } from '@/lib/face/engine'
import { FEEL } from '@/lib/face/feel'
import { isThing } from '@/lib/face/program'
import type { Place, Thing } from '@/lib/face/program'
import { noteOf, stand, wantsBringing } from '@/lib/face/things'
import type { Standing } from '@/lib/face/things'
import { theWork } from '@/lib/face/work'
import { kitDriver } from '@/lib/kit/driver'
import { KIT_SIZE, useKitStage } from '@/lib/kit/stage'
import { prefersReducedMotion } from '@/lib/motion'
import { theSound } from '@/lib/sound/graph'
import { enterWorld, leaveWorld, loadRapier, theWorld } from '@/lib/world'
import { createPainter } from './painter'
import type { Painter } from './painter'
import { forget, locate, reveal, thingsOnPage } from './things'

/** The canvas's own width in CSS pixels; the face is scaled from this. */
export const VISOR_PX = 120
/** How wide the face is at size 1: the message gutter's slot. */
export const REST_PX = 32

interface Point {
  x: number
  y: number
}

const MARGIN = 8
/** How far the pointer may be and still draw the eyes, in pixels. */
const NEAR = 280
/** Past this much movement a press is a carry, not a tap. */
const CARRY_AFTER = 4
/** How long after a performance away from home before it goes back. */
const LINGER_MS = 3_500
/** Pointing at something, it stays longer: the person has to find it and read it. */
const POINT_LINGER_MS = 9_000
/** How big it is while it points, unless told. */
const POINT_SIZE = 1.5
/** While it points its eyes are on the thing, with a glance at the person this often and for this long, in milliseconds. */
const GLANCE = { every: 3_400, for: 520 } as const
/** The shortest trip, in pixels, the eyes announce by looking there first. */
const LEAD_FROM = 48
/** Within this many pixels of where it was going, the eyes let go of it. */
const ARRIVED = 18
/** How many times Rapier is asked for before the glide is accepted. */
const BODY_TRIES = 3
/** How big it is while it has a form (a loudspeaker, a mouth), unless told: there is more to make out than two eyes. */
const FORM_SIZE = 3
/**
 * The arcs that leave a side of the face, in the canvas's own pixels: where
 * they start from, how far they travel, how wide they open and how long one
 * takes. They are drawn outside the visor, which clips its matter.
 */
const WAVE = {
  from: { x: 44, y: 3 },
  near: 20,
  far: 52,
  open: 0.66,
  period: 1_150,
} as const

/** How far past a side of the face its arcs reach, as a share of the face's width. */
const WAVE_REACH = (WAVE.from.x + WAVE.far - VISOR_PX / 2) / VISOR_PX
/** The smallest a form is made to fit: below this there is nothing to make out. */
const FORM_LEAST = 2

const SILENT = {
  'sound.level': 0,
  'sound.low': 0,
  'sound.mid': 0,
  'sound.high': 0,
  'sound.beat': 0,
} as const

/**
 * Theo on the page: where it is, how big, what the pointer does to it, and
 * the loop that advances the face and draws it. React mounts the elements
 * and hands them over; nothing here renders through React.
 */
export class FaceDriver {
  /** Draw the matter as ink: a bare face on a light page. The stage sets it. */
  ink = false
  private painter: Painter | undefined
  private frameId = 0
  private place: Place = 'home'
  /** A size someone asked for; `undefined` sizes itself by what it is doing. */
  private size: number | undefined
  /** Where the person left it; wins over `place` until it is sent home. */
  private free: Point | undefined
  private at: Point = { x: -200, y: -200 }
  private offset: Point = { x: 0, y: 0 }
  private glide = 9
  private shown = 1
  private placed = false
  private pointer: Point = { x: -1e4, y: -1e4 }
  private press:
    { id: number; from: Point; grab: Point; carried: boolean } | undefined
  private strokes: Array<number> = []
  private strokeDirection = 0
  private lastDraw = 0
  private lastWords = ''
  private wordsAt = 0
  private awaySince = 0
  private hiddenAt = 0
  private readonly cleanups: Array<() => void> = []
  private destroyed = false
  /** The figure's physical body, once Rapier has loaded. Until then, and with reduced motion, the figure glides. */
  private body: FaceBody | undefined
  private bodyTries = 0
  private bodyLoading = false
  /** Where the body was last told the layout puts it; `undefined` until it has been told. */
  private anchored: Point | undefined
  /** A move the eyes have announced and the body has not begun. */
  private leaving: { at: number; over: number } | undefined
  /** Where the hand has lately been while it carries, for how fast it lets go. */
  private samples: Array<Sample> = []
  /** When it got to the thing it points at; `undefined` while it is on its way or points at nothing. */
  private pointingSince: number | undefined
  /** What the mark last showed, so the page is written to only when it changes. */
  private marked = ''
  /** The form it has emits arcs past its sides, so it stands clear of the words by that much. */
  private emits = false

  constructor(
    private readonly face: Face,
    private readonly holder: HTMLElement,
    private readonly plate: HTMLElement,
    /** The element the canvas is put in. Each driver makes its own canvas: a WebGL context cannot be handed on. */
    private readonly host: HTMLElement,
    /** What is laid over the thing the figure points at. */
    private readonly mark: HTMLElement,
    /** The arcs that leave the face's sides: the left ones first, then the right. */
    private readonly waves: ReadonlyArray<SVGPathElement>,
    private readonly report: (state: {
      words?: string
      painter?: Painter['kind']
    }) => void,
  ) {}

  start() {
    const { face } = this
    face.still = prefersReducedMotion()
    face.attach({
      gazeAt: (place) => this.gazeAt(place),
      go: (place, size, over) => this.go(place, size, over),
      burst: () => {},
      thing: (thing) => {
        const found = locate(thing)
        if (!found) return undefined
        return noteOf(thing, found, this.standAt(found).where)
      },
      things: () => thingsOnPage(),
      pointing: () => {
        const thing = this.pointed()
        const found = thing && locate(thing)
        return found
          ? { thing: found.name, where: this.standAt(found).where }
          : undefined
      },
    })
    const makeCanvas = () => {
      const canvas = document.createElement('canvas')
      canvas.className = 'block size-full'
      canvas.setAttribute('aria-hidden', 'true')
      this.host.replaceChildren(canvas)
      return canvas
    }
    // If WebGL2 claims the canvas and fails, the fallback needs one of its own.
    void createPainter(makeCanvas(), makeCanvas).then((painter) => {
      if (this.destroyed) painter?.destroy()
      else {
        this.painter = painter
        if (painter) this.report({ painter: painter.kind })
      }
    })
    this.listen()
    // Sound that began before anyone was measuring said so to nobody: take the form it would have given.
    if (theSound().sounding) face.notice('sound.start')
    // A run that was at work before this stage was: the same.
    if (face.working) face.notice('run.work')
    this.frameId = requestAnimationFrame(this.frame)
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.frameId)
    for (const cleanup of this.cleanups) cleanup()
    this.face.attach(undefined)
    this.face.heading(undefined)
    this.face.watch(undefined)
    // Whatever it had turned into for a sound, it does not stay that way with nobody measuring.
    this.face.unform()
    this.face.feed(SILENT)
    for (const wave of this.waves) wave.style.opacity = '0'
    delete this.mark.dataset.on
    forget()
    if (this.body) {
      this.body.destroy()
      leaveWorld()
    }
    this.body = undefined
    this.painter?.destroy()
    this.host.replaceChildren()
  }

  // Where it is ---------------------------------------------------------------

  /** Asks for the physical body. The first carry, poke or trip wants it, and so does Kit having one, so the two can meet; a page with no Kit that never touches Theo never loads Rapier. */
  private wantBody() {
    if (
      this.body ||
      this.bodyLoading ||
      this.destroyed ||
      this.bodyTries >= BODY_TRIES
    )
      return
    this.bodyLoading = true
    this.bodyTries++
    void loadRapier().then(
      (rapier) => {
        this.bodyLoading = false
        if (this.destroyed) return
        this.body = new FaceBody(
          rapier,
          this.at,
          this.dimensions(),
          enterWorld(rapier),
        )
        this.anchored = undefined
      },
      () => {
        // No physics here: the glide carries it.
        this.bodyLoading = false
      },
    )
  }

  /** The body, when it is the one moving the figure: it is loaded, and motion is not reduced. */
  private physical() {
    return this.face.still ? undefined : this.body
  }

  /**
   * Sends the face somewhere, over about `over` milliseconds. With a body
   * the eyes turn there first and the body follows; the hand's hold is not
   * overridden.
   */
  go(place: Place, size: number | undefined, over = 620) {
    // The person has it: nothing else moves it until they let go.
    if (this.press?.carried) return
    forget()
    // Nothing on the page by that name (a saved performance, played on another page): it stays where it is.
    if (isThing(place) && !locate(place)) return
    this.wantBody()
    const before = this.target()
    this.free = undefined
    this.place = place
    this.pointingSince = undefined
    forget()
    this.size =
      place === 'home' && size === undefined
        ? undefined
        : // Pointing, it is big enough to be found.
          (size ?? (isThing(place) ? POINT_SIZE : this.size))
    this.awaySince = 0
    const after = this.target()
    const body = this.physical()
    if (body && this.anchored) {
      const from = body.position()
      const dx = after.x - from.x
      const dy = after.y - from.y
      const lead = Math.hypot(dx, dy) > LEAD_FROM ? FEEL.lead : 0
      this.leaving = { at: performance.now() + lead, over }
      if (lead > 0)
        this.face.heading({
          x: clamp(dx / 220, -1, 1),
          y: clamp(dy / 220, -1, 1),
        })
      return
    }
    this.offset = {
      x: before.x + this.offset.x - after.x,
      y: before.y + this.offset.y - after.y,
    }
    this.glide = this.face.still ? 60 : 5.5 / (Math.max(120, over) / 1000)
  }

  private rectOf(selector: string) {
    const element = document.querySelector<HTMLElement>(selector)
    if (!element) return undefined
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return undefined
    return rect
  }

  /** The live message's gutter slot, when it is on screen. */
  private livePerch() {
    const rect = this.rectOf('[data-face-perch="live"]')
    if (!rect) return undefined
    if (rect.bottom < MARGIN || rect.top > window.innerHeight - 96)
      return undefined
    return rect
  }

  /** The artifact the conversation is about: the selected card, or the newest, when any of it is on screen. */
  private artifact() {
    const cards = [
      ...document.querySelectorAll<HTMLElement>('[data-face-perch="artifact"]'),
    ]
    const seen = cards
      .map((card) => ({ card, rect: card.getBoundingClientRect() }))
      .filter(
        ({ rect }) =>
          rect.width > 0 &&
          rect.bottom > MARGIN + 24 &&
          rect.top < window.innerHeight - 24,
      )
    return (
      seen.find(({ card }) => card.dataset.selected !== undefined) ??
      seen.at(-1)
    )?.rect
  }

  /** The thing the figure has been sent to, while nothing has taken it elsewhere. */
  private pointed(): Thing | undefined {
    return isThing(this.place) && !this.free ? this.place : undefined
  }

  /** Where the figure stands for a thing the page found, at the size it is. */
  private standAt(found: NonNullable<ReturnType<typeof locate>>): Standing {
    return stand(
      found,
      this.dimensions(),
      { width: window.innerWidth, height: window.innerHeight },
      MARGIN,
    )
  }

  /** Where it stands to point at a thing; `undefined` when the page has nothing by that name. */
  private standing(thing: Thing): Standing | undefined {
    const found = locate(thing)
    return found && this.standAt(found)
  }

  /** Where a place is on the page, as the face's centre. */
  private pointOf(place: Place, width: number, height: number): Point {
    if (isThing(place))
      // Nothing by that name on the page: it stays where home is.
      return this.standing(place)?.at ?? this.pointOf('home', width, height)
    if (typeof place === 'object')
      return { x: place.x * window.innerWidth, y: place.y * window.innerHeight }
    if (place === 'artifact') {
      const card = this.artifact()
      // No artifact on the page: it stays where home is.
      if (!card) return this.pointOf('home', width, height)
      const room = width + 12 + MARGIN
      const beside =
        window.innerWidth - card.right >= room
          ? card.right + 12 + width / 2
          : card.left >= room
            ? card.left - 12 - width / 2
            : card.right - width / 2 - 12
      // Level with the card's heading, or just above the card when it has to sit over it.
      const level =
        beside > card.right || beside < card.left
          ? card.top + Math.min(card.height / 2, 36)
          : card.top - height / 2 - 8
      return { x: beside, y: level }
    }
    if (place === 'pointer') return { ...this.pointer }
    if (place === 'centre')
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    if (place === 'person')
      return { x: window.innerWidth / 2, y: window.innerHeight * 0.62 }
    if (place === 'home' || place === 'text') {
      const perch = this.livePerch()
      if (perch) {
        // Grown, it reaches into the margin, not over the words; so do the arcs it emits.
        const centre =
          perch.left +
          perch.width / 2 -
          (width - REST_PX) / 2 -
          this.spill(width)
        return {
          x: place === 'text' ? perch.right + width / 2 + 12 : centre,
          y: perch.top + perch.height / 2 + (height - REST_PX * 0.64) / 2,
        }
      }
    }
    const composer = this.rectOf('[data-face-perch="composer"]')
    if (composer)
      return {
        x: composer.left + 14 + width / 2,
        y: composer.top - height / 2 - 8,
      }
    return {
      x: MARGIN + width / 2 + 8,
      y: window.innerHeight - height / 2 - 24,
    }
  }

  /** How far past its sides the arcs it emits reach, at a width: nothing while it emits none. */
  private spill(width: number) {
    return this.emits ? WAVE_REACH * width + 4 : 0
  }

  private dimensions() {
    const width = REST_PX * this.shown
    return {
      width,
      height: width * (this.face.identity.height / this.face.identity.width),
    }
  }

  private target(): Point {
    const { width, height } = this.dimensions()
    const raw = this.free ?? this.pointOf(this.place, width, height)
    // Its arcs stay on the page with it.
    const side = MARGIN + width / 2 + this.spill(width)
    return {
      x: clamp(raw.x, side, Math.max(side, window.innerWidth - side)),
      y: clamp(
        raw.y,
        MARGIN + height / 2,
        Math.max(MARGIN + height / 2, window.innerHeight - MARGIN - height / 2),
      ),
    }
  }

  private gazeAt(place: Place): Point | undefined {
    if (place === 'person') return { x: 0, y: 0 }
    const { width, height } = this.dimensions()
    let point: Point
    if (isThing(place)) {
      const looks = this.standing(place)?.look
      if (!looks) return undefined
      point = looks
    } else if (place === 'artifact') {
      const card = this.artifact()
      if (!card) return undefined
      point = {
        x: card.left + card.width / 2,
        y: card.top + Math.min(card.height / 2, 36),
      }
    } else
      point = this.pointOf(place === 'home' ? 'text' : place, width, height)
    return {
      x: clamp((point.x - this.at.x) / 220, -1, 1),
      y: clamp((point.y - this.at.y) / 220, -1, 1),
    }
  }

  /** How big it wants to be: as asked, or by what it is doing. */
  private wantedSize() {
    if (this.size !== undefined) return this.size
    // Thrown, it stays the size it was carried at until it lands.
    if (this.press?.carried || this.physical()?.state === 'coasting') return 2
    const { player } = this.face
    if (player.holding('form')) return this.formSize()
    if (player.active('performance')) return 2.4
    if (player.active('reaction') || player.active('hand')) return 1.8
    return 1
  }

  /** How big a form is: as big as forms are, or as big as fits between the edge of the page and the words, its arcs included. */
  private formSize() {
    const perch =
      this.place === 'home' && !this.free ? this.livePerch() : undefined
    if (!perch) return FORM_SIZE
    const reach = this.emits ? 1 + 2 * WAVE_REACH : 1
    const fits =
      (perch.right - MARGIN - (this.emits ? 8 : 0)) / (REST_PX * reach)
    return clamp(fits, FORM_LEAST, FORM_SIZE)
  }

  // Sound ---------------------------------------------------------------------

  /** Hands the face what the page's sound measures as now, and what happened in it. */
  private hear(now: number) {
    const { signals, events } = theSound().measure(now)
    this.face.feed({
      'sound.level': signals.level,
      'sound.low': signals.low,
      'sound.mid': signals.mid,
      'sound.high': signals.high,
      'sound.beat': signals.beat,
    })
    for (const event of events) this.face.notice(event)
    // What the run is doing: how busy it is with tools and how hard it was asked to think.
    this.face.feed(theWork().measure(now, this.face.working))
  }

  /** Draws the arcs leaving each side: more of them, and further, the more the face emits. Still, they stand where they are. */
  private emit(now: number, still: boolean) {
    const { left, right } = this.face.emitting()
    // Once a form has emitted it keeps the room for it, so a pause in the sound does not slide the figure about.
    if (!this.face.player.holding('form')) this.emits = false
    else if (Math.max(left, right) > 0.02) this.emits = true
    const each = this.waves.length / 2
    this.waves.forEach((wave, index) => {
      const side = index < each ? -1 : 1
      const amount = side < 0 ? left : right
      if (amount < 0.02) {
        if (wave.style.opacity !== '0') wave.style.opacity = '0'
        return
      }
      const turn = ((index % each) + 0.5) / each
      const along = still ? turn : (now / WAVE.period + turn) % 1
      const radius = WAVE.near + (WAVE.far - WAVE.near) * along
      // A quiet sound's arcs die close by; a loud one's reach the end.
      const reach = clamp((0.3 + 0.85 * amount - along) / 0.2, 0, 1)
      const opacity =
        Math.min(1, amount * 1.5) * Math.sin(Math.PI * along) ** 0.7 * reach
      const centre = {
        x: VISOR_PX / 2 + side * WAVE.from.x,
        y: this.visorHeight / 2 + WAVE.from.y,
      }
      const across = centre.x + side * radius * Math.cos(WAVE.open)
      const down = radius * Math.sin(WAVE.open)
      wave.setAttribute(
        'd',
        `M${across.toFixed(1)} ${(centre.y - down).toFixed(1)}A${radius.toFixed(1)} ${radius.toFixed(1)} 0 0 ${side < 0 ? 0 : 1} ${across.toFixed(1)} ${(centre.y + down).toFixed(1)}`,
      )
      wave.style.opacity = opacity.toFixed(3)
    })
  }

  private get visorHeight() {
    return (VISOR_PX * this.face.identity.height) / this.face.identity.width
  }

  // The body ------------------------------------------------------------------

  /**
   * One frame of the physical body. The hand comes first, then a move the
   * eyes have announced, then a place that itself moves (the pointer); any
   * other change in where the figure belongs is the layout's (a scroll, a
   * resize, the figure growing) and carries the body with it without
   * throwing it. Returns where the figure is.
   */
  private move(body: FaceBody, target: Point, now: number, dt: number): Point {
    const { face } = this
    const { width, height } = this.dimensions()
    body.bounds(window.innerWidth, window.innerHeight, MARGIN)
    body.resize(width, height)
    if (!this.anchored) {
      // Taking over from the glide: from wherever that had got to.
      body.rest(this.placed ? this.at : target)
      body.anchor(target, 620)
      this.anchored = target
      this.offset = { x: 0, y: 0 }
    }
    const was = body.position()
    let shiftX = 0
    let shiftY = 0
    if (this.press?.carried) {
      this.leaving = undefined
      face.heading(undefined)
      body.hold(target)
      this.anchored = target
    } else if (this.leaving) {
      if (now >= this.leaving.at) {
        body.anchor(target, this.leaving.over)
        this.leaving = undefined
        this.anchored = target
      }
    } else if (body.state === 'coasting') {
      // Thrown: it is the simulation's until it lands.
    } else if (this.place === 'pointer' && !this.free) {
      body.anchor(target)
      this.anchored = target
    } else {
      shiftX = target.x - this.anchored.x
      shiftY = target.y - this.anchored.y
      if (shiftX !== 0 || shiftY !== 0) {
        body.shift(shiftX, shiftY)
        this.anchored = target
      }
    }
    const out = body.advance(dt)
    for (const bump of out.bumps)
      face.bump(bump.side, bump.speed / BODY.throwAt, bump.against)
    if (out.landed && !this.leaving) {
      // Where a throw leaves it is where the person left it.
      this.free = out.landed
      this.anchored = out.landed
    }
    const at = body.position()
    if (!this.leaving && Math.hypot(at.x - target.x, at.y - target.y) < ARRIVED)
      face.heading(undefined)
    if (this.placed && dt > 0) {
      const perUnit = (REST_PX * this.shown) / face.identity.width
      face.sway(
        (at.x - was.x - shiftX) / perUnit,
        (at.y - was.y - shiftY) / perUnit,
        dt,
      )
    }
    return at
  }

  /** A poke pushes the figure away from where it was touched, in pixels from its centre; the tether brings it back. */
  private recoil(dx: number, dy: number) {
    const body = this.physical()
    if (!body || body.state === 'held') return
    const far = Math.hypot(dx, dy)
    // Touched in the middle, it is pressed into the page: down.
    const away = far < 3 ? { x: 0, y: 1 } : { x: -dx / far, y: -dy / far }
    body.nudge({ x: away.x * FEEL.recoil, y: away.y * FEEL.recoil })
  }

  /**
   * Lays the mark over what the figure points at and keeps its eyes there,
   * with a glance at the person now and then. Returns whether its eyes are
   * taken.
   */
  private point(now: number): boolean {
    const thing = this.press?.carried ? undefined : this.pointed()
    const standing = thing && this.standing(thing)
    const mark = standing?.mark
    const next = mark
      ? `${mark.kind} ${mark.box.left.toFixed(1)} ${mark.box.top.toFixed(1)} ${(mark.box.right - mark.box.left).toFixed(1)} ${(mark.box.bottom - mark.box.top).toFixed(1)}`
      : ''
    if (next !== this.marked) {
      this.marked = next
      const { style, dataset } = this.mark
      if (mark) {
        dataset.kind = mark.kind
        dataset.on = ''
        style.transform = `translate3d(${mark.box.left.toFixed(1)}px, ${mark.box.top.toFixed(1)}px, 0)`
        style.width = `${(mark.box.right - mark.box.left).toFixed(1)}px`
        style.height = `${(mark.box.bottom - mark.box.top).toFixed(1)}px`
      } else delete dataset.on
    }
    if (!standing) {
      this.pointingSince = undefined
      return false
    }
    const near =
      Math.hypot(this.at.x - standing.at.x, this.at.y - standing.at.y) <
      ARRIVED * 2
    if (!near) {
      this.pointingSince = undefined
      return false
    }
    this.pointingSince ??= now
    const since = now - this.pointingSince
    const glancing =
      !this.face.still &&
      since > GLANCE.every / 2 &&
      (since - GLANCE.every / 2) % GLANCE.every < GLANCE.for
    this.face.watch(
      glancing
        ? undefined
        : {
            x: clamp((standing.look.x - this.at.x) / 220, -1, 1),
            y: clamp((standing.look.y - this.at.y) / 220, -1, 1),
          },
    )
    return true
  }

  /** What a screen reader hears of where it points. */
  private pointingWords(): string | undefined {
    const thing = this.pointed()
    const found = thing && locate(thing)
    if (!found) return undefined
    const standing = this.standAt(found)
    const { where } = standing
    const what = found.label ?? found.name
    if (!wantsBringing(thing, found, standing)) return `pointing at ${what}`
    return `pointing at ${what}, which is ${where === 'closed' ? 'folded away' : where === 'in view' ? 'not all showing' : `${where} what is showing`}; press it to bring that into view`
  }

  /**
   * The person pressed it while it points at something they cannot see:
   * that is brought to them. Returns whether it was.
   */
  private bring(): boolean {
    const thing = this.pointed()
    const found = thing && locate(thing)
    if (!thing || !found) return false
    if (!wantsBringing(thing, found, this.standAt(found))) return false
    reveal(thing, !this.face.still)
    this.awaySince = 0
    this.face.rouse()
    return true
  }

  /** Kit in the air has Theo's eye: a jump, a fall, a throw. */
  private watchKit(pointing: boolean) {
    const { mounted, motion } = useKitStage.getState()
    const kit = mounted ? kitDriver() : undefined
    if (
      !kit ||
      (motion !== 'air' && motion !== 'fall') ||
      this.press?.carried
    ) {
      if (!pointing) this.face.watch(undefined)
      return
    }
    const [x, y] = kit.position()
    this.face.watch({
      x: clamp((x + KIT_SIZE / 2 - this.at.x) / 220, -1, 1),
      y: clamp((y + KIT_SIZE / 2 - this.at.y) / 220, -1, 1),
    })
  }

  // Frames --------------------------------------------------------------------

  private readonly frame = (now: number) => {
    this.frameId = requestAnimationFrame(this.frame)
    const { face } = this
    // Asleep, a few frames a second is plenty.
    if (face.asleep && now - this.lastDraw < 80) return
    const dt = Math.min(0.1, this.lastDraw ? (now - this.lastDraw) / 1000 : 0)
    this.lastDraw = now

    const still = face.still
    this.hear(now)
    const wanted = this.wantedSize()
    this.shown = still
      ? wanted
      : this.shown + (wanted - this.shown) * (1 - Math.exp(-dt * 9))
    if (Math.abs(wanted - this.shown) < 0.002) this.shown = wanted

    // Away from home with nothing left to perform: go back.
    if (this.place !== 'home' && !this.free) {
      if (face.player.active('performance')) this.awaySince = 0
      else if (this.awaySince === 0) this.awaySince = now
      else if (
        now - this.awaySince >
        (isThing(this.place) ? POINT_LINGER_MS : LINGER_MS)
      )
        this.go('home', undefined)
    }

    // Kit has a body in the world: Theo's joins it, so the two can meet.
    if (!this.body && theWorld()?.figure('kit')) this.wantBody()
    this.watchKit(this.point(now))

    const target = this.target()
    const scale = (REST_PX * this.shown) / VISOR_PX
    const body = this.physical()
    if (!body) this.anchored = undefined
    const moved = body ? this.move(body, target, now, dt) : undefined
    const decay = still ? 0 : Math.exp(-dt * this.glide)
    this.offset.x *= decay
    this.offset.y *= decay
    const x = moved ? moved.x : target.x + this.offset.x
    const y = moved ? moved.y : target.y + this.offset.y
    if (this.placed && !still && !moved) {
      // The matter lags behind a face that moves; a scroll that carries it does not count.
      const perUnit = (scale * VISOR_PX) / face.identity.width
      const dx = clamp((x - this.at.x) / perUnit, -6, 6)
      const dy = clamp((y - this.at.y) / perUnit, -6, 6)
      if (
        Math.abs(this.offset.x) + Math.abs(this.offset.y) > 0.5 ||
        this.press?.carried
      )
        face.field.shove(dx * 0.35, dy * 0.35)
    }
    this.at = { x, y }
    this.placed = true

    const grains = face.frame(now)
    this.painter?.draw(
      grains,
      face.field.count,
      face.identity.width,
      face.identity.height,
      this.ink,
    )

    const head = face.head()
    const unit = VISOR_PX / face.identity.width
    const half = VISOR_PX / 2
    const halfHeight =
      (VISOR_PX * face.identity.height) / face.identity.width / 2
    this.holder.style.transform = `translate3d(${(x - half).toFixed(2)}px, ${(y - halfHeight).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`
    const headTransform = `translate(${(head.dx * unit).toFixed(2)}px, ${(head.dy * unit).toFixed(2)}px) rotate(${head.tilt.toFixed(2)}deg) scale(${(head.scale * (1 + head.squash)).toFixed(4)}, ${(head.scale * (1 - head.squash)).toFixed(4)})`
    this.plate.style.transform = headTransform
    // The arcs leave the head, so they lean and nod with it.
    const sheet = this.waves[0]?.ownerSVGElement
    if (sheet) sheet.style.transform = headTransform
    this.emit(now, still)

    if (now - this.wordsAt > 300) {
      this.wordsAt = now
      const words = this.pointingWords() ?? face.words()
      if (words !== this.lastWords) {
        this.lastWords = words
        this.report({ words })
      }
    }
  }

  // The person and the environment ---------------------------------------------

  private on(
    target: Window | Document | HTMLElement,
    type: string,
    handler: (event: never) => void,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, handler as EventListener, options)
    this.cleanups.push(() =>
      target.removeEventListener(type, handler as EventListener, options),
    )
  }

  private listen() {
    const { face, holder } = this
    const throttled = (kind: string, every: number) => {
      let last = -Infinity
      return () => {
        const now = performance.now()
        if (now - last < every) return
        last = now
        face.notice(kind)
      }
    }

    this.on(window, 'pointermove', (event: PointerEvent) => {
      this.pointer = { x: event.clientX, y: event.clientY }
      const dx = event.clientX - this.at.x
      const dy = event.clientY - this.at.y
      const press = this.press
      if (press && event.pointerId === press.id) {
        const moved = Math.hypot(
          event.clientX - press.from.x,
          event.clientY - press.from.y,
        )
        if (!press.carried && moved > CARRY_AFTER) {
          press.carried = true
          face.grab()
        }
        if (press.carried) {
          const next = {
            x: event.clientX - press.grab.x,
            y: event.clientY - press.grab.y,
          }
          if (this.physical()) {
            // The body reads the motion off where the hand takes it; the last few places say how fast it lets go.
            this.samples.push({ at: event.timeStamp, x: next.x, y: next.y })
            if (this.samples.length > 12) this.samples.shift()
          } else {
            const perUnit = (REST_PX * this.shown) / face.identity.width
            face.carry(
              (next.x - (this.free?.x ?? this.at.x)) / perUnit,
              (next.y - (this.free?.y ?? this.at.y)) / perUnit,
            )
          }
          this.free = next
          this.offset = { x: 0, y: 0 }
        }
        return
      }
      face.followPointer(
        Math.hypot(dx, dy) < NEAR ? { x: dx / 150, y: dy / 150 } : undefined,
      )
    })
    this.on(document, 'pointerleave', () => face.followPointer(undefined))

    this.on(holder, 'pointerenter', () => this.wantBody())
    this.on(holder, 'focus', () => this.wantBody())
    this.on(holder, 'pointerdown', (event: PointerEvent) => {
      if (event.button !== 0) return
      this.wantBody()
      const body = this.physical()
      if (body?.state === 'coasting') {
        // Caught in the air: it stops where the hand met it.
        body.rest(this.at)
        this.free = { ...this.at }
        this.anchored = { ...this.at }
      }
      this.samples = []
      holder.setPointerCapture(event.pointerId)
      this.press = {
        id: event.pointerId,
        from: { x: event.clientX, y: event.clientY },
        grab: { x: event.clientX - this.at.x, y: event.clientY - this.at.y },
        carried: false,
      }
      event.preventDefault()
    })
    const release = (event: PointerEvent) => {
      const press = this.press
      if (!press || event.pointerId !== press.id) return
      this.press = undefined
      if (holder.hasPointerCapture(event.pointerId))
        holder.releasePointerCapture(event.pointerId)
      if (press.carried) {
        const body = this.physical()
        const velocity = body
          ? releaseVelocity(this.samples, event.timeStamp)
          : { x: 0, y: 0 }
        this.samples = []
        // Let go from where the hand is now, not where the last frame had it.
        body?.hold(this.target())
        // A cancelled press is put down, never thrown.
        if (event.type === 'pointerup' && body?.release(velocity))
          face.toss(Math.hypot(velocity.x, velocity.y) / BODY.throwAt)
        else {
          body?.release({ x: 0, y: 0 })
          face.drop()
        }
        return
      }
      // Pointing at something out of sight, a tap asks to see it.
      if (this.bring()) return
      const dx = event.clientX - this.at.x
      const dy = event.clientY - this.at.y
      const perUnit = (REST_PX * this.shown) / face.identity.width
      face.poke(dx / perUnit, dy / perUnit)
      this.recoil(dx, dy)
    }
    this.on(holder, 'pointerup', release)
    this.on(holder, 'pointercancel', release)

    // A stroke: the pointer passing back and forth over it with no button down.
    this.on(holder, 'pointermove', (event: PointerEvent) => {
      if (this.press || event.buttons !== 0 || Math.abs(event.movementX) < 1)
        return
      const direction = Math.sign(event.movementX)
      if (direction === this.strokeDirection) return
      this.strokeDirection = direction
      const now = performance.now()
      this.strokes = [...this.strokes.filter((at) => now - at < 1_400), now]
      if (this.strokes.length >= 3) {
        this.strokes = []
        face.notice('person.pet')
      }
    })
    this.on(holder, 'dblclick', () => this.go('home', undefined))
    this.on(holder, 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        if (this.bring()) return
        face.poke()
        this.recoil(0, 0)
      } else if (event.key === 'Escape') this.go('home', undefined)
    })

    this.on(window, 'resize', throttled('env.resize', 500))
    this.on(window, 'online', () => face.notice('env.online'))
    this.on(window, 'offline', () => face.notice('env.offline'))
    this.on(document, 'copy', throttled('env.copy', 1_000))
    const typed = throttled('person.type', 2_000)
    this.on(
      document,
      'input',
      (event: Event) => {
        if ((event.target as Element | null)?.closest('.aui-composer-input'))
          typed()
      },
      { capture: true },
    )
    this.on(
      document,
      'submit',
      (event: Event) => {
        if ((event.target as Element | null)?.closest('.aui-composer-root'))
          face.notice('person.send')
      },
      { capture: true },
    )
    this.on(document, 'visibilitychange', () => {
      if (document.hidden) this.hiddenAt = performance.now()
      else if (this.hiddenAt && performance.now() - this.hiddenAt > 20_000)
        face.notice('person.return')
    })

    const theme = new MutationObserver(throttled('env.theme', 800))
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-palette'],
    })
    this.cleanups.push(() => theme.disconnect())

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const settle = () => {
      face.still = prefersReducedMotion()
    }
    motion.addEventListener('change', settle)
    this.cleanups.push(() => motion.removeEventListener('change', settle))
  }
}
