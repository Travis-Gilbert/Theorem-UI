// SOURCING: lib/kit/physics (Rapier 2D: walking by its character controller, jumps, falls, flings and throws as a dynamic body, surfaces as kinematic colliders, a shape cast for ground and one for a thrown Theo on its way), loaded lazily and only when motion is not reduced, in the world lib/world shares with Theo's body; animejs (createDraggable for the person's hand, its release glide stopped so Kit is thrown instead, its velocity and angle read as the throw; animate with a spring for the landing squash, utils.set for the stretch in flight); prefersReducedMotion from lib/motion; stage.ts for where surfaces are and which catches a fall when there is no physics
import { animate, createDraggable, spring, utils } from 'animejs'
import type { Draggable } from 'animejs'
import { prefersReducedMotion } from '@/lib/motion'
import {
  FEET,
  KIT_SIZE,
  atOf,
  changeStage,
  landingLine,
  perchElement,
  perchLine,
  perchLines,
  standPoint,
  surfaceAround,
  useKitStage,
} from './stage'
import type { Gait, Motion, PerchLine, PerchName } from './stage'
import type { KitDirection } from './contract/KitDirection'
import type { KitJumpStyle } from './contract/KitJumpStyle'
import type { KitTouchKind } from './contract/KitTouchKind'
import {
  GRAVITY,
  KitWorld,
  PX,
  STEP,
  bodyOf,
  launchVelocity,
  loadRapier,
  timeToFall,
} from './physics'
import type { Coming } from './physics'
import { enterWorld, leaveWorld } from '../world'

/** Walking pace and running pace, in CSS pixels per second. */
const PACE: Record<'walk' | 'run', number> = { walk: 70, run: 190 }
/** Crouches before a jump and after a landing, in milliseconds. */
const CROUCH_MS = 130
/** How often Kit checks that its perch is still where it was. */
const TRACK_MS = 400
/** How long Kit waits for its perch to mount before it settles elsewhere. */
const WAIT_FOR_PERCH_MS = 4000
/** Longest a flight may last before Kit is set down, in seconds of the world's time. */
const MAX_FLIGHT_S = 8
/** How high each jump passes above the higher of its ends, in metres, and how much distance adds. */
const RISE: Record<KitJumpStyle, { least: number; per: number }> = {
  hop: { least: 0.45, per: 0.05 },
  arc: { least: 1.2, per: 0.12 },
  leap: { least: 2.8, per: 0.3 },
}
/** Which way each fling throws Kit, before strength. */
const FLINGS: Record<KitDirection, [number, number]> = {
  left: [-1, -0.45],
  right: [1, -0.45],
  up: [0, -1],
  up_left: [-0.6, -1],
  up_right: [0.6, -1],
}
/** A release faster than this, in metres per second, is a throw; slower is a carry. */
const THROWN = 7
/** The fastest a person can throw Kit, in metres per second. */
const MAX_THROW = 40
/** A release this long after the last drag movement is set down, not thrown. */
const HELD_STILL_MS = 90
/** How often a follow looks again for where its target is. */
const FOLLOW_MS = 450
/** Struck by Theo where it stands, Kit takes this share of Theo's speed and is lifted by at least this much, in metres per second. */
const KNOCK = { share: 0.55, lift: 5 }
/**
 * A jump over Theo goes at least `least` metres higher than it must, and
 * higher the longer Theo takes to pass, up to `most`; Kit leaves the ground
 * so as to be just clear as Theo arrives, with `early` seconds to spare, and
 * a jump begun later than `late` of the way up is still worth making.
 */
const OVER = { least: 0.45, most: 1.6, early: 0.04, late: 0.5 }
/** Kit ducks when Theo is this many seconds off, and stays down at least and at most this long, in milliseconds. */
const DUCK = { ahead: 0.32, least: 240, most: 1400 }
/** Kit's spring back from a landing's squash. */
const REBOUND = spring({ bounce: 0.55, duration: 420 })

export class KitRefusal extends Error {}

/** One frame of time, in seconds; immediate and coarse while the page is hidden, so a move finishes. */
function frame(last: { at: number }): Promise<number> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      const now = performance.now()
      const hidden = document.visibilityState === 'hidden'
      resolve(hidden ? 0.25 : Math.min(0.1, (now - last.at) / 1000))
      last.at = now
    }
    const raf = requestAnimationFrame(finish)
    // Frames can stop without the page reporting hidden (a background
    // window, an embedded view): the world keeps time by the clock instead.
    const timer = setTimeout(
      finish,
      document.visibilityState === 'hidden' ? 0 : 100,
    )
  })
}

/**
 * Moves the element that holds Kit. While Kit stands, it keeps it on its
 * surface as the layout shifts, with no physics running. Walks, jumps,
 * falls, flings and the person's throws run in Rapier, a step at a time, and
 * end when Kit rests on a surface. Position is a translate the draggable
 * owns; every move goes through it so a grab starts where Kit is.
 */
export class KitDriver {
  private readonly draggable: Draggable
  /** Counts moves; a move whose count is no longer current was stopped. */
  private generation = 0
  private crouching: ((finished: boolean) => void) | undefined
  private x = 0
  private y = 0
  private dragged = false
  private lastDragAt = 0
  private readonly observer: ResizeObserver | undefined
  private observed: Element | undefined
  private readonly timer: ReturnType<typeof setInterval>
  private readonly onWindowResize = () => this.track()
  private readonly onPointer = (event: PointerEvent) => {
    this.cursor = [event.clientX, event.clientY]
  }
  private cursor: [number, number] | undefined
  private following = 0
  /** Ends the running follow: its time is up, or the turn that asked for it ended. */
  private followEnd: (() => void) | undefined
  private readonly element: HTMLElement
  /** When Kit came on screen; its perch may still be mounting for a moment. */
  private readonly born = Date.now()
  private placed = false
  private physics: KitWorld | undefined
  private loadingPhysics: Promise<KitWorld | undefined> | undefined
  private readonly clock = { at: 0 }
  private destroyed = false
  /** Getting out of a thrown Theo's way: nothing more is made of its coming until that is over. */
  private dodging = false

  constructor(
    element: HTMLElement,
    private readonly onTap: () => void,
    /** The element squashed and stretched; it holds the sprite, its origin at Kit's feet. */
    private readonly squash?: HTMLElement,
  ) {
    this.draggable = createDraggable(element, {
      dragThreshold: 3,
      cursor: { onHover: 'grab', onGrab: 'grabbing' },
      onGrab: () => {
        this.dragged = false
        this.halt()
      },
      onDrag: (draggable) => {
        if (!this.dragged) {
          this.dragged = true
          this.setMotion('held')
          // In the hand its body is not where it is: nothing in the world meets it.
          this.physics?.lift()
        }
        this.lastDragAt = performance.now()
        this.x = draggable.x
        this.y = draggable.y
      },
      onRelease: (draggable) => {
        // The draggable has started its own glide; Kit is thrown instead.
        draggable.stop()
        this.x = draggable.x
        this.y = draggable.y
        // A tap that stopped Kit mid-stride lets it settle where it was.
        const moving = useKitStage.getState().motion !== 'still'
        if (this.dragged) {
          const fresh = performance.now() - this.lastDragAt < HELD_STILL_MS
          const speed = fresh
            ? Math.min(MAX_THROW, (draggable.velocity * 1000) / PX)
            : 0
          const velocity = {
            x: Math.cos(draggable.angle) * speed,
            y: Math.sin(draggable.angle) * speed,
          }
          void this.release(velocity, speed > THROWN ? 'thrown' : 'moved')
        } else {
          if (moving) void this.drop()
          this.touch('tapped', useKitStage.getState().perch)
          this.onTap()
        }
      },
    })
    if (squash) squash.style.transformOrigin = `50% ${FEET}px`
    this.observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => this.track())
    window.addEventListener('resize', this.onWindowResize)
    window.addEventListener('pointermove', this.onPointer, { passive: true })
    this.timer = setInterval(() => this.track(), TRACK_MS)
    // Hidden until it first stands somewhere, so it never shows at the corner.
    element.style.visibility = 'hidden'
    this.element = element
    this.track()
    // The physics loads in the background; a move that comes first waits for it.
    void this.world()
  }

  destroy() {
    this.destroyed = true
    this.halt()
    clearInterval(this.timer)
    this.observer?.disconnect()
    window.removeEventListener('resize', this.onWindowResize)
    window.removeEventListener('pointermove', this.onPointer)
    this.draggable.revert()
    if (this.physics) {
      this.physics.destroy()
      leaveWorld()
    }
    this.physics = undefined
  }

  /** Where Kit's frame is now, for tests and the scene. */
  position(): [number, number] {
    return [this.x, this.y]
  }

  /** Kit's body in the figures' world, loaded on first need; none under reduced motion, or when Rapier fails to load. */
  private world(): Promise<KitWorld | undefined> {
    if (this.physics) return Promise.resolve(this.physics)
    if (prefersReducedMotion()) return Promise.resolve(undefined)
    this.loadingPhysics ??= loadRapier()
      .then((rapier) => {
        if (this.destroyed) return undefined
        const world = new KitWorld(rapier, this.x, this.y, enterWorld(rapier))
        // Until Kit stands somewhere its body is nowhere.
        if (!this.placed) world.lift()
        world.onStruck = (velocity, airborne) => this.struck(velocity, airborne)
        world.onComing = (coming) => this.dodge(coming)
        this.physics = world
        return world
      })
      .catch((error: unknown) => {
        console.warn('Kit moves without physics: Rapier did not load', error)
        return undefined
      })
      .finally(() => {
        this.loadingPhysics = undefined
      })
    return this.loadingPhysics
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

  private touch(kind: KitTouchKind, onto: PerchName) {
    changeStage({ touched: { kind, onto, at: Date.now() } })
  }

  /**
   * Stops whatever Kit is doing, a follow included, and lets it fall to
   * whatever is below when that left it in the air or mid-crouch.
   */
  interrupt() {
    this.halt()
    if (this.busy() && !this.draggable.grabbed) void this.drop()
  }

  /** Stops the running move and any follow, leaving Kit where it is: the person grabbed it, or another move takes over. */
  private halt() {
    this.followEnd = undefined
    this.following++
    this.stop()
  }

  /** Ends the running move. Its promise resolves as not finished. */
  private stop() {
    this.generation++
    this.crouching?.(false)
    this.crouching = undefined
    this.physics?.ground()
    this.physics?.duck(false)
    if (this.squash) {
      utils.remove(this.squash)
      utils.set(this.squash, { scaleX: 1, scaleY: 1 })
    }
  }

  private busy() {
    return useKitStage.getState().motion !== 'still'
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
    // Its body stands where it does, so Theo, thrown, meets it there.
    const body = this.physics
    if (body && !body.isAirborne()) {
      const [bx, by] = body.frame()
      if (body.lifted || bx !== x || by !== y) body.place(x, y)
    }
  }

  /** Crouches a moment; resolves false when stopped first (a grab, or another move). */
  private crouch(): Promise<boolean> {
    this.setMotion('crouch')
    if (this.squash) utils.set(this.squash, { scaleX: 1.08, scaleY: 0.88 })
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.crouching = undefined
        resolve(true)
      }, CROUCH_MS)
      this.crouching = (finished) => {
        clearTimeout(timer)
        resolve(finished)
      }
    })
  }

  /** Squashes Kit by how hard it hit, metres per second, and springs it back. */
  private squashBy(impact: number) {
    if (!this.squash) return
    const k = Math.min(0.32, Math.max(0.06, impact / 26))
    animate(this.squash, {
      scaleX: [1 + k, 1],
      scaleY: [1 - k, 1],
      ease: REBOUND,
    })
  }

  /** Stretches Kit along its speed in flight. */
  private stretch(speed: number) {
    if (!this.squash) return
    const s = Math.min(0.16, speed / 70)
    utils.set(this.squash, { scaleX: 1 - s * 0.5, scaleY: 1 + s })
  }

  /** Lands on `line` at `at`, crouching, then stands still. */
  private async land(line: PerchLine, at: number, impact = 0) {
    changeStage({ perch: line.name, at })
    this.place(...standPoint(line, at))
    this.physics?.place(this.x, this.y)
    if (prefersReducedMotion()) return this.setMotion('still')
    this.squashBy(impact)
    const generation = this.generation
    this.setMotion('crouch')
    await new Promise((resolve) => setTimeout(resolve, CROUCH_MS))
    // A newer move (a grab and throw during the crouch) keeps its body awake.
    if (generation === this.generation) {
      this.setMotion('still')
      this.physics?.sleep()
    }
  }

  /** Sets Kit down on whatever is below it at once: there is no physics, or a flight ran too long. */
  private async settle() {
    const line = landingLine(perchLines(), this.x, this.y) ?? perchLine('floor')
    if (line) await this.land(line, atOf(line, this.x))
  }

  /** The world, brought to the shell as it is now, with Kit where its frame is. */
  private async ready(): Promise<KitWorld | undefined> {
    const world = await this.world()
    if (!world || this.destroyed) return undefined
    world.sync(perchLines(), window.innerWidth, window.innerHeight)
    if (!world.isAirborne()) world.place(this.x, this.y)
    this.clock.at = performance.now()
    return world
  }

  /**
   * Flies until Kit rests on a surface. With `aim`, steers toward that
   * surface's point `at` as it moves, and only it (or the floor) catches
   * Kit. Resolves with where Kit came to rest, or undefined when stopped.
   */
  private async flight(
    world: KitWorld,
    generation: number,
    aim?: { name: PerchName; at: number },
  ): Promise<PerchName | undefined> {
    let elapsed = 0
    let carry = 0
    while (generation === this.generation) {
      const dt = await frame(this.clock)
      if (generation !== this.generation) return undefined
      world.sync(perchLines(), window.innerWidth, window.innerHeight)
      if (aim) {
        const line = world.line(aim.name)
        if (line) {
          const goal = bodyOf(...standPoint(line, aim.at))
          const [x, y] = world.frame()
          const now = bodyOf(x, y)
          const velocity = world.velocity()
          const left = timeToFall(now.y, velocity.y, goal.y)
          if (left !== undefined && velocity.y > -4)
            world.steer(
              Math.max(
                -25,
                Math.min(25, (goal.x - now.x) / Math.max(left, STEP)),
              ),
            )
        }
      }
      carry += dt
      let rest: PerchName | undefined
      let impact = 0
      for (; carry >= STEP && rest === undefined; carry -= STEP) {
        elapsed += STEP
        const step = world.fly()
        if (step.impact > impact) impact = step.impact
        const v = world.velocity()
        if (step.under !== undefined && Math.abs(v.y) < 1.2) rest = step.under
      }
      const [x, y] = world.frame()
      this.place(x, y)
      const v = world.velocity()
      if (
        Math.abs(v.x) > 0.3 &&
        (v.x > 0 ? 1 : -1) !== useKitStage.getState().facing
      )
        changeStage({ facing: v.x > 0 ? 1 : -1 })
      if (rest !== undefined) {
        const line = world.line(rest) ?? perchLine(rest)
        world.ground()
        if (line) await this.land(line, atOf(line, x), impact)
        return rest
      }
      if (impact > 3) this.squashBy(impact)
      else this.stretch(Math.hypot(v.x, v.y))
      this.setMotion(v.y < 0 ? 'air' : 'fall')
      if (elapsed > MAX_FLIGHT_S) {
        world.ground()
        await this.settle()
        return useKitStage.getState().perch
      }
    }
    return undefined
  }

  /** Falls from where Kit is to whatever is below it. */
  async drop() {
    await this.release({ x: 0, y: 0 })
  }

  /** Lets go of Kit at `velocity`, metres per second, bouncing by `bounce`; reports the person's touch once it rests. */
  private async release(
    velocity: { x: number; y: number },
    touch?: KitTouchKind,
    bounce = touch === 'thrown' ? 0.38 : 0.12,
  ) {
    this.stop()
    const generation = this.generation
    // Carried into a surface's box and let go, Kit climbs onto its top; it
    // would fall through it otherwise, since surfaces catch only from above.
    const inside =
      touch === 'moved'
        ? surfaceAround(this.x + KIT_SIZE / 2, this.y + KIT_SIZE / 2)
        : undefined
    const climb = inside && {
      line: inside,
      at: atOf(inside, this.x),
    }
    const above = climb && standPoint(climb.line, climb.at)[1] < this.y - 2
    const world = await this.ready()
    if (generation !== this.generation) return
    let onto: PerchName | undefined
    if (climb && above) {
      if (world)
        await this.jump(
          world,
          generation,
          climb.line.name,
          climb.at,
          'hop',
          touch,
        )
      else await this.land(climb.line, climb.at)
      if (generation === this.generation) onto = useKitStage.getState().perch
    } else if (!world) {
      await this.settle()
      onto = useKitStage.getState().perch
    } else {
      this.setMotion('fall')
      world.launch(velocity, bounce)
      onto = await this.flight(world, generation)
    }
    if (touch && onto !== undefined) this.touch(touch, onto)
  }

  // Theo ---------------------------------------------------------------------
  // Theo's body is in the same world (lib/world). Thrown, it strikes Kit;
  // Kit sees it coming and gets out of the way when it can.

  /** Where Kit stands on its surface now: a walk cut short leaves it part way along. */
  private standHere() {
    const state = useKitStage.getState()
    const line = perchLine(state.perch)
    if (line) changeStage({ at: atOf(line, this.x) })
    return useKitStage.getState()
  }

  /**
   * Theo, thrown, struck Kit, moving at `velocity` metres per second.
   * Standing, Kit is knocked off its feet the way Theo was going; in the air
   * the collision has already moved it.
   */
  private struck(velocity: { x: number; y: number }, airborne: boolean) {
    if (this.destroyed || this.draggable.grabbed) return
    this.squashBy(Math.hypot(velocity.x, velocity.y) * 0.6)
    if (airborne) return
    if (Math.abs(velocity.x) > 0.3)
      changeStage({ facing: velocity.x > 0 ? 1 : -1 })
    void this.release(
      {
        x: velocity.x * KNOCK.share,
        y: Math.min(velocity.y * KNOCK.share, 0) - KNOCK.lift,
      },
      undefined,
      0.38,
    )
  }

  /**
   * Theo, thrown, is on its way to where Kit stands. Kit turns to it. When
   * it is close, Kit ducks if that lets Theo over it, or jumps so as to be
   * above it as it passes; with no time for either it is struck.
   */
  private dodge(coming: Coming) {
    if (this.dodging || this.destroyed || this.draggable.grabbed) return
    const { motion, facing } = useKitStage.getState()
    if (motion !== 'still' && motion !== 'walk' && motion !== 'run') return
    if (motion === 'still' && facing !== coming.from)
      changeStage({ facing: coming.from })
    if (coming.over) {
      if (coming.in <= DUCK.ahead) void this.duck()
      return
    }
    if (coming.rise === undefined) return
    // Above it for as long as it is under: the time spent over a height goes as the root of how far over.
    const over = Math.min(
      OVER.most,
      Math.max(OVER.least, (GRAVITY * coming.passing ** 2) / 8 + 0.1),
    )
    const rise = coming.rise + over
    const up = Math.sqrt(2 * GRAVITY * rise)
    // How long the way up to just clear of it takes.
    const clear =
      (up - Math.sqrt(up * up - 2 * GRAVITY * coming.rise)) / GRAVITY
    // Not yet, while there is longer than that to go: all its time above is for Theo passing.
    if (coming.in > clear + OVER.early) return
    if (coming.in >= clear * OVER.late) void this.leap(rise)
  }

  /** Ducks until Theo has gone over. */
  private async duck() {
    const world = this.physics
    if (!world) return
    this.stop()
    const generation = this.generation
    this.dodging = true
    this.standHere()
    this.setMotion('crouch')
    world.duck(true)
    if (this.squash) utils.set(this.squash, { scaleX: 1.2, scaleY: 0.58 })
    const began = performance.now()
    let clear = 0
    while (generation === this.generation) {
      await frame(this.clock)
      const waited = performance.now() - began
      clear = world.coming() || world.overhead() ? 0 : clear + 1
      if ((waited >= DUCK.least && clear >= 3) || waited > DUCK.most) break
    }
    this.dodging = false
    world.duck(false)
    // Stopped first (a grab, another move): that has it now.
    if (generation !== this.generation) return
    if (this.squash)
      animate(this.squash, { scaleX: 1, scaleY: 1, ease: REBOUND })
    this.setMotion('still')
    world.sleep()
  }

  /** Jumps `rise` metres straight up from where it stands and comes down there. */
  private async leap(rise: number) {
    this.stop()
    const generation = this.generation
    this.dodging = true
    try {
      const world = await this.ready()
      if (!world || generation !== this.generation) return
      const state = this.standHere()
      const from = bodyOf(this.x, this.y)
      world.launch(launchVelocity(from, from, rise), 0, state.perch)
      this.setMotion('air')
      await this.flight(world, generation, { name: state.perch, at: state.at })
    } finally {
      this.dodging = false
    }
  }

  private claim() {
    if (this.draggable.grabbed)
      throw new KitRefusal('the person is holding Kit')
    this.halt()
    return this.generation
  }

  /**
   * Goes to `perch` at `at`. Along the perch it stands on, it walks or runs;
   * to another perch, or when told to jump, it jumps in an arc and lands.
   */
  async moveTo(perch: PerchName, at: number, gait: Gait): Promise<boolean> {
    const generation = this.claim()
    return this.go(generation, perch, at, gait)
  }

  private async go(
    generation: number,
    perch: PerchName,
    at: number,
    gait: Gait,
  ): Promise<boolean> {
    const target = perchLine(perch)
    if (!target) throw new KitRefusal(`there is no ${perch} on screen now`)
    const state = useKitStage.getState()
    const [tx, ty] = standPoint(target, at)
    // Standing on (or walking along) that perch now, not in the air above it.
    const grounded =
      perch === state.perch &&
      state.motion !== 'air' &&
      state.motion !== 'fall' &&
      Math.abs(ty - this.y) < 3
    if (Math.abs(tx - this.x) > 1) changeStage({ facing: tx > this.x ? 1 : -1 })
    const world = await this.ready()
    if (generation !== this.generation) return false
    if (!world) {
      await this.land(target, at)
      return true
    }
    if (grounded && gait !== 'jump')
      return this.stroll(world, generation, perch, at, gait)
    return this.jump(world, generation, perch, at, 'arc')
  }

  /** Walks or runs along the surface Kit stands on, moving with it, until it is there. */
  private async stroll(
    world: KitWorld,
    generation: number,
    perch: PerchName,
    at: number,
    gait: 'walk' | 'run',
  ): Promise<boolean> {
    let carry = 0
    this.setMotion(gait)
    while (generation === this.generation) {
      const dt = await frame(this.clock)
      if (generation !== this.generation) return false
      const line = perchLine(perch)
      if (!line) {
        void this.drop()
        return false
      }
      world.sync(perchLines(), window.innerWidth, window.innerHeight)
      const goal = standPoint(line, at)
      carry += dt
      let held = true
      for (; carry >= STEP && held; carry -= STEP)
        held = world.walk(goal, PACE[gait] * STEP, perch)
      const [x, y] = world.frame()
      this.place(x, y)
      if (!held) {
        // The ground went from under Kit: it falls from where it walked.
        world.launch(
          { x: ((goal[0] > x ? 1 : -1) * PACE[gait]) / PX, y: 0 },
          0.1,
        )
        this.setMotion('fall')
        await this.flight(world, generation)
        return false
      }
      if (Math.abs(goal[0] - x) < 1) {
        changeStage({ perch, at })
        this.place(...goal)
        world.place(...goal)
        this.setMotion('still')
        world.sleep()
        return true
      }
    }
    return false
  }

  /** Jumps to `perch` at `at` in a real arc and lands. Resolves whether Kit landed there. */
  async jumpTo(
    perch: PerchName,
    at: number,
    style: KitJumpStyle,
  ): Promise<boolean> {
    const generation = this.claim()
    if (!perchLine(perch))
      throw new KitRefusal(`there is no ${perch} on screen now`)
    const world = await this.ready()
    if (generation !== this.generation) return false
    if (!world) {
      const line = perchLine(perch)
      if (line) await this.land(line, at)
      return line !== undefined
    }
    return this.jump(world, generation, perch, at, style)
  }

  private async jump(
    world: KitWorld,
    generation: number,
    perch: PerchName,
    at: number,
    style: KitJumpStyle,
    /** The person's touch this jump finishes; the fall that replaces it reports it instead. */
    touch?: KitTouchKind,
  ): Promise<boolean> {
    if (!(await this.crouch())) return false
    if (generation !== this.generation) return false
    const goal = perchLine(perch)
    if (!goal) {
      // The perch went away during the crouch: Kit settles where it is.
      void this.release({ x: 0, y: 0 }, touch)
      return false
    }
    const [gx, gy] = standPoint(goal, at)
    if (Math.abs(gx - this.x) > 1) changeStage({ facing: gx > this.x ? 1 : -1 })
    const from = bodyOf(this.x, this.y)
    const to = bodyOf(gx, gy)
    const distance = Math.hypot(to.x - from.x, to.y - from.y)
    const rise = RISE[style].least + distance * RISE[style].per
    const velocity = launchVelocity(from, to, rise)
    world.place(this.x, this.y)
    world.launch(velocity, 0, perch)
    this.setMotion('air')
    const onto = await this.flight(world, generation, { name: perch, at })
    return onto === perch
  }

  /** Throws Kit `direction` with `strength` 0..1; resolves with where it came to rest. */
  async fling(
    direction: KitDirection,
    strength: number,
  ): Promise<PerchName | undefined> {
    const generation = this.claim()
    const world = await this.ready()
    if (generation !== this.generation) return undefined
    const [dx, dy] = FLINGS[direction]
    const length = Math.hypot(dx, dy)
    const speed = 8 + strength * 22
    if (dx !== 0) changeStage({ facing: dx > 0 ? 1 : -1 })
    if (!world) {
      // Without physics Kit is set down where the throw would carry it, at once.
      this.place(
        Math.max(
          0,
          Math.min(window.innerWidth - KIT_SIZE, this.x + dx * speed * 12),
        ),
        this.y,
      )
      await this.settle()
      return useKitStage.getState().perch
    }
    if (!(await this.crouch())) return undefined
    if (generation !== this.generation) return undefined
    world.place(this.x, this.y)
    world.launch({ x: (dx / length) * speed, y: (dy / length) * speed }, 0.4)
    this.setMotion('air')
    return this.flight(world, generation)
  }

  /**
   * Goes within reach of `target` and faces it: along the surface Kit stands
   * on when that passes under or over the target, or else onto the target's
   * nearer end. Resolves whether Kit got there.
   */
  async pointAt(target: PerchName): Promise<boolean> {
    const goal = perchLine(target)
    if (!goal) throw new KitRefusal(`there is no ${target} on screen now`)
    const generation = this.claim()
    const state = useKitStage.getState()
    const here = perchLine(state.perch)
    const middle = (goal.left + goal.right) / 2
    let arrived: boolean
    if (
      here &&
      target !== state.perch &&
      middle >= here.left &&
      middle <= here.right
    ) {
      const at = atOf(
        here,
        middle - KIT_SIZE / 2 - (middle > this.x ? 24 : -24),
      )
      arrived = await this.go(generation, state.perch, at, 'walk')
    } else if (target === state.perch) {
      arrived = true
    } else {
      const near = this.x + KIT_SIZE / 2 < middle ? 0.05 : 0.95
      arrived = await this.go(generation, target, near, 'jump')
    }
    if (!arrived || generation !== this.generation) return false
    changeStage({ facing: middle >= this.x + KIT_SIZE / 2 ? 1 : -1 })
    return true
  }

  /**
   * Follows `target` for `seconds`: the person's pointer, going to the
   * surface under it, or a surface, staying on it as it moves. It ends when
   * the time is up or `endFollow` is called (the turn that asked for it
   * ended), stopping the step it is taking, and early when the person picks
   * Kit up or another move begins.
   */
  follow(target: PerchName | 'cursor', seconds: number) {
    this.claim()
    // A move cut off in the air would hold the follow up: Kit lands first.
    if (this.busy()) void this.drop()
    const token = this.following
    /** The generation of the step the follow is taking, while it takes one. */
    let stepping: number | undefined
    const end = () => {
      if (token !== this.following) return
      if (stepping === this.generation) this.interrupt()
      else this.halt()
    }
    this.followEnd = end
    const deadline = setTimeout(end, seconds * 1000)
    const going = () =>
      token === this.following && document.visibilityState === 'visible'
    void (async () => {
      while (going()) {
        const state = useKitStage.getState()
        if (!this.busy()) {
          const goal =
            target === 'cursor' ? this.cursorGoal() : this.surfaceGoal(target)
          if (goal === null) break
          if (goal) {
            const [gx] = standPoint(goal.line, goal.at)
            const same = goal.line.name === state.perch
            const far = Math.abs(gx - this.x)
            if (!same || far > 20) {
              this.stop()
              stepping = this.generation
              await this.go(
                stepping,
                goal.line.name,
                goal.at,
                same ? (far > 220 ? 'run' : 'walk') : 'jump',
              ).catch(() => false)
              stepping = undefined
            }
          }
        }
        await new Promise((resolve) => setTimeout(resolve, FOLLOW_MS))
      }
      clearTimeout(deadline)
      if (this.followEnd === end) this.followEnd = undefined
    })()
  }

  /** Ends the running follow, and the step it is taking: the turn that asked for it ended. */
  endFollow() {
    this.followEnd?.()
  }

  /** The surface under the pointer and where along it, or nothing yet. */
  private cursorGoal(): { line: PerchLine; at: number } | undefined {
    if (!this.cursor) return undefined
    const [cx, cy] = this.cursor
    const x = cx - KIT_SIZE / 2
    const line =
      landingLine(perchLines(), x, cy - FEET - 4) ?? perchLine('floor')
    return line && { line, at: atOf(line, x) }
  }

  /** Where on a followed surface Kit stays; null once the surface has gone. */
  private surfaceGoal(
    name: PerchName,
  ): { line: PerchLine; at: number } | null | undefined {
    const line = perchLine(name)
    if (!line) return null
    const state = useKitStage.getState()
    if (state.perch === name) return undefined
    return { line, at: 0.5 }
  }

  /** A little hop where Kit stands: a turn just went out. */
  async hop() {
    const state = useKitStage.getState()
    if (this.busy() || this.draggable.grabbed || prefersReducedMotion()) return
    this.halt()
    const generation = this.generation
    const world = await this.ready()
    if (!world || generation !== this.generation) return
    await this.jump(world, generation, state.perch, state.at, 'hop')
  }
}

let current: KitDriver | undefined

/** The driver of the mounted stage, if Kit is on screen. */
export const kitDriver = () => current

export function setKitDriver(driver: KitDriver | undefined) {
  current = driver
}
