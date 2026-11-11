// SOURCING: lib/kit/driver.ts for the shape of it (one object that owns a figure's place on the page, its pointer handling and its frame loop, outside React); lib/face/engine for everything the face is; lib/face/body (Rapier) for how the figure travels, is carried, thrown and knocked, loaded on first need, with the glide this file had before it kept for a browser that cannot load it and for reduced motion; lib/world for the world that body is in, which is Kit's too, so a thrown Theo strikes Kit; lib/kit/driver and lib/kit/stage for where Kit is while it is in the air, which the eyes follow. Anchors are attributes the shell puts on its own elements (`data-face-perch`), found afresh each frame so a perch that scrolls away or unmounts is simply no longer chosen. The gestures (tap, carry, stroke, double-tap home) are this app's.
import { BODY, FaceBody, releaseVelocity } from '@/lib/face/body'
import type { Sample } from '@/lib/face/body'
import { clamp } from '@/lib/face/channels'
import type { Face } from '@/lib/face/engine'
import { FEEL } from '@/lib/face/feel'
import type { Place } from '@/lib/face/program'
import { kitDriver } from '@/lib/kit/driver'
import { KIT_SIZE, useKitStage } from '@/lib/kit/stage'
import { prefersReducedMotion } from '@/lib/motion'
import { enterWorld, leaveWorld, loadRapier, theWorld } from '@/lib/world'
import { createPainter } from './painter'
import type { Painter } from './painter'

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
/** The shortest trip, in pixels, the eyes announce by looking there first. */
const LEAD_FROM = 48
/** Within this many pixels of where it was going, the eyes let go of it. */
const ARRIVED = 18
/** How many times Rapier is asked for before the glide is accepted. */
const BODY_TRIES = 3

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

  constructor(
    private readonly face: Face,
    private readonly holder: HTMLElement,
    private readonly plate: HTMLElement,
    /** The element the canvas is put in. Each driver makes its own canvas: a WebGL context cannot be handed on. */
    private readonly host: HTMLElement,
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
    this.frameId = requestAnimationFrame(this.frame)
  }

  destroy() {
    this.destroyed = true
    cancelAnimationFrame(this.frameId)
    for (const cleanup of this.cleanups) cleanup()
    this.face.attach(undefined)
    this.face.heading(undefined)
    this.face.watch(undefined)
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
    this.wantBody()
    const before = this.target()
    this.free = undefined
    this.place = place
    this.size =
      place === 'home' && size === undefined ? undefined : (size ?? this.size)
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

  /** Where a place is on the page, as the face's centre. */
  private pointOf(place: Place, width: number, height: number): Point {
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
        // Grown, it reaches into the margin, not over the words.
        const centre = perch.left + perch.width / 2 - (width - REST_PX) / 2
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
    return {
      x: clamp(
        raw.x,
        MARGIN + width / 2,
        Math.max(MARGIN + width / 2, window.innerWidth - MARGIN - width / 2),
      ),
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
    if (place === 'artifact') {
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
    if (player.active('performance')) return 2.4
    if (player.active('reaction') || player.active('hand')) return 1.8
    return 1
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

  /** Kit in the air has Theo's eye: a jump, a fall, a throw. */
  private watchKit() {
    const { mounted, motion } = useKitStage.getState()
    const kit = mounted ? kitDriver() : undefined
    if (
      !kit ||
      (motion !== 'air' && motion !== 'fall') ||
      this.press?.carried
    ) {
      this.face.watch(undefined)
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
    const wanted = this.wantedSize()
    this.shown = still
      ? wanted
      : this.shown + (wanted - this.shown) * (1 - Math.exp(-dt * 9))
    if (Math.abs(wanted - this.shown) < 0.002) this.shown = wanted

    // Away from home with nothing left to perform: go back.
    if (this.place !== 'home' && !this.free) {
      if (face.player.active('performance')) this.awaySince = 0
      else if (this.awaySince === 0) this.awaySince = now
      else if (now - this.awaySince > LINGER_MS) this.go('home', undefined)
    }

    // Kit has a body in the world: Theo's joins it, so the two can meet.
    if (!this.body && theWorld()?.figure('kit')) this.wantBody()
    this.watchKit()

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
    this.plate.style.transform = `translate(${(head.dx * unit).toFixed(2)}px, ${(head.dy * unit).toFixed(2)}px) rotate(${head.tilt.toFixed(2)}deg) scale(${(head.scale * (1 + head.squash)).toFixed(4)}, ${(head.scale * (1 - head.squash)).toFixed(4)})`

    if (now - this.wordsAt > 300) {
      this.wordsAt = now
      const words = face.words()
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
