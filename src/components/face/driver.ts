// SOURCING: lib/kit/driver.ts for the shape of it (one object that owns a figure's place on the page, its pointer handling and its frame loop, outside React); lib/face/engine for everything the face is. Anchors are attributes the shell puts on its own elements (`data-face-perch`), found afresh each frame so a perch that scrolls away or unmounts is simply no longer chosen. The gestures (tap, carry, stroke, double-tap home) are this app's.
import { clamp } from '@/lib/face/channels'
import type { Face } from '@/lib/face/engine'
import type { Place } from '@/lib/face/program'
import { prefersReducedMotion } from '@/lib/motion'
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
    this.painter?.destroy()
    this.host.replaceChildren()
  }

  // Where it is ---------------------------------------------------------------

  /** Sends the face somewhere, gliding there over about `over` milliseconds. */
  go(place: Place, size: number | undefined, over = 620) {
    const before = this.target()
    this.free = undefined
    this.place = place
    this.size =
      place === 'home' && size === undefined ? undefined : (size ?? this.size)
    this.awaySince = 0
    const after = this.target()
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

  /** Where a place is on the page, as the face's centre. */
  private pointOf(place: Place, width: number, height: number): Point {
    if (typeof place === 'object')
      return { x: place.x * window.innerWidth, y: place.y * window.innerHeight }
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
    const point = this.pointOf(place === 'home' ? 'text' : place, width, height)
    return {
      x: clamp((point.x - this.at.x) / 220, -1, 1),
      y: clamp((point.y - this.at.y) / 220, -1, 1),
    }
  }

  /** How big it wants to be: as asked, or by what it is doing. */
  private wantedSize() {
    if (this.size !== undefined) return this.size
    if (this.press?.carried) return 2
    const { player } = this.face
    if (player.active('performance')) return 2.4
    if (player.active('reaction') || player.active('hand')) return 1.8
    return 1
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

    const target = this.target()
    const decay = still ? 0 : Math.exp(-dt * this.glide)
    this.offset.x *= decay
    this.offset.y *= decay
    const x = target.x + this.offset.x
    const y = target.y + this.offset.y
    const scale = (REST_PX * this.shown) / VISOR_PX
    if (this.placed && !still) {
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
          const perUnit = (REST_PX * this.shown) / face.identity.width
          face.carry(
            (next.x - (this.free?.x ?? this.at.x)) / perUnit,
            (next.y - (this.free?.y ?? this.at.y)) / perUnit,
          )
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

    this.on(holder, 'pointerdown', (event: PointerEvent) => {
      if (event.button !== 0) return
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
        face.drop()
        return
      }
      const perUnit = (REST_PX * this.shown) / face.identity.width
      face.poke(
        (event.clientX - this.at.x) / perUnit,
        (event.clientY - this.at.y) / perUnit,
      )
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
