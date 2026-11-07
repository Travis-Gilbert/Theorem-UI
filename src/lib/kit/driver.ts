// SOURCING: animejs (animate for walks, hops, jumps and falls on a plain object; createDraggable for the person's hand, its release stopped so Kit falls instead of gliding); prefersReducedMotion from lib/motion; stage.ts for where perches are and which catches a fall
import { animate, createDraggable } from 'animejs'
import type { Draggable, JSAnimation } from 'animejs'
import { prefersReducedMotion } from '@/lib/motion'
import {
  atOf,
  changeStage,
  landingLine,
  perchElement,
  perchLine,
  perchLines,
  standPoint,
  useKitStage,
} from './stage'
import type { Gait, Motion, PerchLine, PerchName } from './stage'

/** Walking pace and running pace, in CSS pixels per second. */
const PACE: Record<'walk' | 'run', number> = { walk: 70, run: 190 }
/** Crouches before a jump and after a landing, in milliseconds. */
const CROUCH_MS = 130
/** How often Kit checks that its perch is still where it was. */
const TRACK_MS = 400
/** How long Kit waits for its perch to mount before it settles elsewhere. */
const WAIT_FOR_PERCH_MS = 4000
/** How far past its duration a tween may run before it is taken as finished. */
const OVERDUE_MS = 1500

export class KitRefusal extends Error {}

/**
 * Moves the element that holds Kit: stands it on its perch and keeps it
 * there as the layout shifts, walks and jumps it when asked, and lets the
 * person pick it up and drop it anywhere. Position is a translate the
 * draggable owns; every move goes through it so a grab starts where Kit is.
 */
export class KitDriver {
  private readonly draggable: Draggable
  private animation: JSAnimation | undefined
  private settle: ((landed: boolean) => void) | undefined
  private x = 0
  private y = 0
  private dragged = false
  private readonly observer: ResizeObserver | undefined
  private observed: Element | undefined
  private readonly timer: ReturnType<typeof setInterval>
  private readonly onWindowResize = () => this.track()
  // anime.js pauses while the page is hidden; a run waiting on a move must not wait for the person to come back.
  private readonly onVisibility = () => {
    if (document.visibilityState === 'hidden') this.stop(true)
  }
  private readonly element: HTMLElement
  /** When Kit came on screen; its perch may still be mounting for a moment. */
  private readonly born = Date.now()
  private placed = false

  constructor(
    element: HTMLElement,
    private readonly onTap: () => void,
  ) {
    this.draggable = createDraggable(element, {
      dragThreshold: 3,
      cursor: { onHover: 'grab', onGrab: 'grabbing' },
      onGrab: () => {
        this.dragged = false
        this.stop()
      },
      onDrag: (draggable) => {
        if (!this.dragged) {
          this.dragged = true
          this.setMotion('held')
        }
        this.x = draggable.x
        this.y = draggable.y
      },
      onRelease: (draggable) => {
        // The draggable has started its own glide; Kit falls instead.
        draggable.stop()
        this.x = draggable.x
        this.y = draggable.y
        // A tap that stopped Kit mid-stride lets it settle where it was.
        const moving = useKitStage.getState().motion !== 'still'
        if (this.dragged || moving) void this.drop()
        if (!this.dragged) this.onTap()
      },
    })
    this.observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => this.track())
    window.addEventListener('resize', this.onWindowResize)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.timer = setInterval(() => this.track(), TRACK_MS)
    // Hidden until it first stands somewhere, so it never shows at the corner.
    element.style.visibility = 'hidden'
    this.element = element
    this.track()
  }

  destroy() {
    this.stop()
    clearInterval(this.timer)
    this.observer?.disconnect()
    window.removeEventListener('resize', this.onWindowResize)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.draggable.revert()
  }

  /** Where Kit's frame is now, for tests and the scene. */
  position(): [number, number] {
    return [this.x, this.y]
  }

  private place(x: number, y: number) {
    this.x = x
    this.y = y
    this.draggable.setX(x, true).setY(y, true)
    if (!this.placed) {
      this.placed = true
      this.element.style.visibility = ''
    }
  }

  private setMotion(motion: Motion) {
    if (useKitStage.getState().motion !== motion) changeStage({ motion })
  }

  /**
   * Ends the running tween. Cut short, its promise resolves as not landed;
   * finished, as landed, and the caller puts Kit where the tween was going.
   */
  private stop(finished = false) {
    this.animation?.cancel()
    this.animation = undefined
    this.settle?.(finished)
    this.settle = undefined
  }

  /** No tween plays: motion is reduced, or the page is hidden and anime.js is paused. */
  private instant() {
    return prefersReducedMotion() || document.visibilityState === 'hidden'
  }

  private busy() {
    const { motion } = useKitStage.getState()
    return motion !== 'still' || this.animation !== undefined
  }

  /**
   * While still, keeps Kit standing where it stands as its perch moves or
   * resizes; a perch that went away drops Kit to whatever is below.
   */
  track(): void {
    const state = useKitStage.getState()
    if (this.busy() || this.draggable.grabbed) return
    const element =
      state.perch === 'floor' ? undefined : perchElement(state.perch)
    if (element !== this.observed) {
      if (this.observed) this.observer?.unobserve(this.observed)
      if (element) this.observer?.observe(element)
      this.observed = element
    }
    const line = perchLine(state.perch)
    if (!line && !this.placed) {
      // The page is still coming up: wait for the perch, then settle for the rail.
      if (Date.now() - this.born < WAIT_FOR_PERCH_MS) return
      if (state.perch !== 'rail' && perchLine('rail')) {
        changeStage({ perch: 'rail', at: 0.5 })
        return this.track()
      }
      changeStage({ perch: 'floor', at: 0.5 })
      return this.track()
    }
    if (!line) {
      void this.drop()
      return
    }
    const [x, y] = standPoint(line, state.at)
    if (x !== this.x || y !== this.y) this.place(x, y)
  }

  /** Runs one tween on a plain object; resolves when it lands or is cut short. */
  private tween(
    target: Record<string, number>,
    to: Record<string, number>,
    duration: number,
    ease: string,
    update: () => void,
  ): Promise<boolean> {
    this.stop()
    // Hidden since the move began: skip to the end.
    if (document.visibilityState === 'hidden') return Promise.resolve(true)
    return new Promise((resolve) => {
      // Frames can stop without the page reporting hidden (a background
      // window, an embedded view); past its time the tween counts as done.
      const overdue = setTimeout(() => {
        if (this.animation === animation) this.stop(true)
      }, duration + OVERDUE_MS)
      this.settle = (landed) => {
        clearTimeout(overdue)
        resolve(landed)
      }
      const animation = animate(target, {
        ...to,
        duration,
        ease,
        onUpdate: update,
        onComplete: () => {
          clearTimeout(overdue)
          this.animation = undefined
          this.settle = undefined
          resolve(true)
        },
      })
      this.animation = animation
    })
  }

  private crouch(): Promise<void> {
    this.setMotion('crouch')
    return new Promise((resolve) => setTimeout(resolve, CROUCH_MS))
  }

  /** Lands on `line` at `at`, crouching, then stands still. */
  private async land(line: PerchLine, at: number) {
    changeStage({ perch: line.name, at })
    this.place(...standPoint(line, at))
    if (!this.instant()) await this.crouch()
    this.setMotion('still')
  }

  /** Falls from where Kit is to whatever is below it. */
  async drop() {
    const line = landingLine(perchLines(), this.x, this.y) ?? perchLine('floor')
    if (!line) return
    const at = atOf(line, this.x)
    const [x, y] = standPoint(line, at)
    if (this.instant()) return this.land(line, at)
    const distance = Math.max(0, y - this.y)
    const from = { x: this.x, y: this.y }
    this.setMotion('fall')
    const landed = await this.tween(
      from,
      { x, y },
      Math.max(140, Math.sqrt(distance) * 32),
      'in(2)',
      () => this.place(from.x, from.y),
    )
    if (landed) await this.land(line, at)
  }

  /**
   * Goes to `perch` at `at`. Along the perch it stands on, it walks or runs;
   * to another perch, or when told to jump, it leaps in an arc and lands.
   */
  async moveTo(perch: PerchName, at: number, gait: Gait): Promise<boolean> {
    if (this.draggable.grabbed)
      throw new KitRefusal('the person is holding Kit')
    const target = perchLine(perch)
    if (!target) throw new KitRefusal(`there is no ${perch} on screen now`)
    this.stop()
    const state = useKitStage.getState()
    const [tx, ty] = standPoint(target, at)
    // Standing on (or walking along) that perch now, not in the air above it.
    const grounded =
      perch === state.perch &&
      state.motion !== 'air' &&
      state.motion !== 'fall' &&
      Math.abs(ty - this.y) < 3
    if (tx !== this.x) changeStage({ facing: tx > this.x ? 1 : -1 })
    if (this.instant()) {
      await this.land(target, at)
      return true
    }
    if (grounded && gait !== 'jump') {
      const pace = PACE[gait]
      const from = { at: atOf(target, this.x) }
      const distance = Math.abs(tx - this.x)
      if (distance < 2) {
        changeStage({ at })
        this.setMotion('still')
        return true
      }
      this.setMotion(gait)
      const done = await this.tween(
        from,
        { at },
        (distance / pace) * 1000,
        'linear',
        () => {
          const line = perchLine(perch)
          if (line) this.place(...standPoint(line, from.at))
        },
      )
      if (done) {
        changeStage({ at })
        this.setMotion('still')
      }
      return done
    }
    return this.leap(target.name, at)
  }

  /** A jump in an arc from where Kit is to `at` along `perch`, following the perch if it moves mid-air. */
  private async leap(perch: PerchName, at: number, rise = 0): Promise<boolean> {
    await this.crouch()
    const start = { x: this.x, y: this.y }
    const goal = perchLine(perch)
    if (!goal) return false
    const [gx, gy] = standPoint(goal, at)
    const distance = Math.hypot(gx - start.x, gy - start.y)
    const height = Math.max(rise || 40, distance * 0.22, start.y - gy + 36)
    const flight = { t: 0 }
    this.setMotion('air')
    const landed = await this.tween(
      flight,
      { t: 1 },
      Math.min(1400, 380 + distance * 0.5),
      'linear',
      () => {
        const line = perchLine(perch) ?? goal
        const [ex, ey] = standPoint(line, at)
        const t = flight.t
        if (t > 0.5) this.setMotion('fall')
        this.place(
          start.x + (ex - start.x) * t,
          start.y + (ey - start.y) * t - height * 4 * t * (1 - t),
        )
      },
    )
    if (!landed) return false
    const line = perchLine(perch) ?? goal
    await this.land(line, at)
    return true
  }

  /** A little hop where Kit stands: a turn just went out. */
  async hop() {
    const state = useKitStage.getState()
    if (this.busy() || this.draggable.grabbed || this.instant()) return
    await this.leap(state.perch, state.at, 14)
  }
}

let current: KitDriver | undefined

/** The driver of the mounted stage, if Kit is on screen. */
export const kitDriver = () => current

export function setKitDriver(driver: KitDriver | undefined) {
  current = driver
}
