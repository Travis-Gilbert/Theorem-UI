// SOURCING: @dimforge/rapier2d-compat 0.21 (a world without gravity on a fixed step; one rigid body for the whole figure, dynamic while it travels or is thrown; a spring joint from a kinematic pin for the tether's pull, with the body's linear damping to settle it; fixed walls at the window's edges; continuous collision detection; collision events for contact), loaded through lib/kit/physics's loadRapier so Theo and Kit share one WASM chunk and one scale. Hand-rolled: the accumulator with bounded catch-up and the interpolation between steps (Rapier steps a world, it does not pace one against a display), and the release velocity read off the hand's last samples.
import type RAPIER from '@dimforge/rapier2d-compat'
import type {
  Collider,
  EventQueue,
  ImpulseJoint,
  RigidBody,
  World,
} from '@dimforge/rapier2d-compat'
import { PX, STEP } from '@/lib/kit/physics'

type Rapier = typeof RAPIER

export interface Point {
  x: number
  y: number
}

export type Side = 'left' | 'right' | 'top' | 'bottom'

/** The figure met an edge of the page, moving into it at `speed` pixels per second. */
export interface Bump {
  readonly side: Side
  readonly speed: number
}

/**
 * What the body is doing. At rest it sits on its anchor and nothing is
 * simulated; tethered it is pulled to the anchor by the spring; held it is
 * wherever the hand is; coasting it has been let go while moving.
 */
export type BodyState = 'resting' | 'tethered' | 'held' | 'coasting'

/** A place the hand was, and when, in milliseconds. */
export interface Sample {
  readonly at: number
  readonly x: number
  readonly y: number
}

export const BODY = {
  /** Steps run in one frame at most. Time past that is dropped, so a tab that stalled does not lurch when it wakes. */
  catchUp: 5,
  /** The tether's damping ratio: critical, so an arrival settles and does not ring. What few pixels it still runs past come from the fixed step. */
  damping: 1,
  /** How fast a coast dies away, per second: let go at a walking pace it carries on about a fifth of that distance. */
  drag: 4.5,
  /** How much speed an edge gives back. */
  bounce: 0.35,
  /** Let go slower than this, in pixels per second, it is put down, not thrown. */
  throwFrom: 140,
  /** A throw is never faster than this, in pixels per second. */
  throwAt: 1500,
  /** Tethered, this close to the anchor (pixels) and this slow (pixels per second), it is at rest. */
  restWithin: 0.4,
  restBelow: 6,
  /** A coast slower than this, in pixels per second, has ended. */
  coastBelow: 14,
  /** A meeting with an edge slower than this, in pixels per second, is not a bump. */
  bumpFrom: 60,
} as const

/** Half the thickness of a wall, in metres. */
const WALL = 1
/** The figure's mass. Fixed, so the figure growing does not change how the tether pulls. */
const MASS = 1
/** Collision groups: everything, and nothing. */
const SOLID = 0xffff_ffff
const GHOST = 0x0001_0000

/** How fast the tether pulls, in radians per second, for a move meant to take about `over` milliseconds. */
export const tetherRate = (over: number) =>
  Math.min(20, Math.max(5, 6000 / Math.max(120, over)))

/**
 * The hand's velocity as it lets go, in pixels per second: over the last
 * `span` milliseconds it moved, and nothing if it had stopped before it let
 * go. Never faster than a throw may be.
 *
 * A busy page hands over the hand's places far apart, so both spans stretch
 * to the gap between the last two (up to `widest`): one late frame is not
 * the hand stopping, and two places are always enough to read a speed off.
 */
export function releaseVelocity(
  samples: ReadonlyArray<Sample>,
  now: number,
  span = 90,
  pause = 70,
  widest = 160,
): Point {
  const last = samples.at(-1)
  const prior = samples.at(-2)
  if (!last || !prior) return { x: 0, y: 0 }
  const gap = Math.min(last.at - prior.at, widest)
  if (now - last.at > Math.max(pause, gap * 1.5)) return { x: 0, y: 0 }
  const reach = Math.max(span, gap)
  const first = samples.find((sample) => last.at - sample.at <= reach) ?? last
  const seconds = (last.at - first.at) / 1000
  if (seconds < 0.012) return { x: 0, y: 0 }
  const x = (last.x - first.x) / seconds
  const y = (last.y - first.y) / seconds
  const speed = Math.hypot(x, y)
  const scale = speed > BODY.throwAt ? BODY.throwAt / speed : 1
  return { x: x * scale, y: y * scale }
}

/** What a span of time did to the body. */
export interface Advanced {
  readonly bumps: ReadonlyArray<Bump>
  /** Where a coast came to rest, when it did in this span. */
  readonly landed: Point | undefined
}

const NOTHING: Advanced = { bumps: [], landed: undefined }

/**
 * Theo's figure as one physical body on the page, in pixels. It owns where
 * the figure is; what the face inside it does is the rig's. The page calls
 * `anchor` when the figure means to be somewhere, `shift` when the layout
 * moved that somewhere under it, `hold` and `release` for the hand, `nudge`
 * for a poke, and `advance` once a frame.
 *
 * The edges of the window are solid to a thrown figure only. Deliberate
 * travel passes them by: its destinations are inside them already.
 */
export class FaceBody {
  private readonly world: World
  private readonly body: RigidBody
  private readonly collider: Collider
  private readonly pin: RigidBody
  private readonly walls: Array<RigidBody> = []
  private readonly sides = new Map<number, Side>()
  private readonly events: EventQueue
  private joint: ImpulseJoint | undefined
  private rate = tetherRate(620)
  private mode: BodyState = 'resting'
  /** Time owed to the simulation, in seconds. */
  private owed = 0
  private before: Point
  private after: Point
  private anchorAt: Point
  private hand: Point
  private size = { width: 0, height: 0 }
  private window = { width: 0, height: 0, margin: 0 }

  constructor(
    private readonly rapier: Rapier,
    at: Point,
    size: { width: number; height: number },
  ) {
    this.world = new rapier.World({ x: 0, y: 0 })
    this.world.timestep = STEP
    this.before = { ...at }
    this.after = { ...at }
    this.anchorAt = { ...at }
    this.hand = { ...at }
    this.pin = this.world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(
        at.x / PX,
        at.y / PX,
      ),
    )
    this.body = this.world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(at.x / PX, at.y / PX)
        .lockRotations()
        .setCcdEnabled(true)
        .setCanSleep(false),
    )
    this.collider = this.world.createCollider(
      rapier.ColliderDesc.cuboid(0.5, 0.5)
        .setMass(MASS)
        .setFriction(0)
        .setRestitution(BODY.bounce)
        .setCollisionGroups(GHOST)
        .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
      this.body,
    )
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      const wall = this.world.createRigidBody(rapier.RigidBodyDesc.fixed())
      const collider = this.world.createCollider(
        rapier.ColliderDesc.cuboid(WALL, WALL).setFriction(0),
        wall,
      )
      this.walls.push(wall)
      this.sides.set(collider.handle, side)
    }
    this.events = new rapier.EventQueue(true)
    this.resize(size.width, size.height)
  }

  destroy() {
    this.events.free()
    this.world.free()
  }

  get state(): BodyState {
    return this.mode
  }

  /** The window the figure stays inside, `margin` pixels in from each edge. */
  bounds(width: number, height: number, margin: number) {
    const { window } = this
    if (
      width === window.width &&
      height === window.height &&
      margin === window.margin
    )
      return
    this.window = { width, height, margin }
    const w = width / PX
    const h = height / PX
    const m = margin / PX
    const reach = Math.max(w, h) + WALL
    const [left, right, top, bottom] = this.walls as [
      RigidBody,
      RigidBody,
      RigidBody,
      RigidBody,
    ]
    left.setTranslation({ x: m - WALL, y: h / 2 }, true)
    right.setTranslation({ x: w - m + WALL, y: h / 2 }, true)
    top.setTranslation({ x: w / 2, y: m - WALL }, true)
    bottom.setTranslation({ x: w / 2, y: h - m + WALL }, true)
    left.collider(0).setHalfExtents({ x: WALL, y: reach })
    right.collider(0).setHalfExtents({ x: WALL, y: reach })
    top.collider(0).setHalfExtents({ x: reach, y: WALL })
    bottom.collider(0).setHalfExtents({ x: reach, y: WALL })
  }

  /** The figure is this big now, in pixels. */
  resize(width: number, height: number) {
    if (
      Math.abs(width - this.size.width) < 0.5 &&
      Math.abs(height - this.size.height) < 0.5
    )
      return
    this.size = { width, height }
    this.collider.setHalfExtents({
      x: Math.max(1, width) / 2 / PX,
      y: Math.max(1, height) / 2 / PX,
    })
  }

  /** Where the figure is now, in pixels, between the last two steps. */
  position(): Point {
    if (this.mode === 'held') return { ...this.hand }
    if (this.mode === 'resting') return { ...this.anchorAt }
    const part = Math.min(1, this.owed / STEP)
    return {
      x: this.before.x + (this.after.x - this.before.x) * part,
      y: this.before.y + (this.after.y - this.before.y) * part,
    }
  }

  /** How fast it is moving, in pixels per second; nothing while held or at rest. */
  velocity(): Point {
    if (this.mode === 'held' || this.mode === 'resting') return { x: 0, y: 0 }
    const v = this.body.linvel()
    return { x: v.x * PX, y: v.y * PX }
  }

  /**
   * The figure means to be at `point`: the tether is fastened there and pulls
   * it over. `over` is about how long the move should take, in milliseconds;
   * left out, the tether keeps its pace. The hand's hold is not overridden.
   */
  anchor(point: Point, over?: number) {
    if (this.mode === 'held') return
    if (over !== undefined) this.pace(tetherRate(over))
    const from = this.mode === 'resting' ? this.anchorAt : this.after
    this.anchorAt = { ...point }
    this.movePin()
    if (
      this.mode === 'resting' &&
      Math.hypot(point.x - from.x, point.y - from.y) < BODY.restWithin
    )
      return
    if (this.mode === 'resting') this.place(from)
    this.tether()
  }

  /**
   * The layout moved the anchor by this much (a scroll, a resize, the figure
   * growing): the body goes with it and keeps the motion it had. Nothing is
   * thrown by the page moving.
   */
  shift(dx: number, dy: number) {
    if (this.mode === 'held' || (dx === 0 && dy === 0)) return
    this.anchorAt = { x: this.anchorAt.x + dx, y: this.anchorAt.y + dy }
    this.movePin()
    if (this.mode === 'resting') return
    this.before = { x: this.before.x + dx, y: this.before.y + dy }
    this.after = { x: this.after.x + dx, y: this.after.y + dy }
    this.body.setTranslation(
      { x: this.after.x / PX, y: this.after.y / PX },
      true,
    )
  }

  /** The hand has it: it is wherever the hand is, and nothing else moves it. */
  hold(point: Point) {
    if (this.mode !== 'held') {
      this.untether()
      this.mode = 'held'
      this.owed = 0
    }
    this.hand = { ...point }
  }

  /**
   * The hand lets go, moving at `velocity` pixels per second. Fast enough,
   * the figure is thrown and coasts; otherwise it is put down where it is.
   * Says whether it was thrown.
   */
  release(velocity: Point): boolean {
    if (this.mode !== 'held') return false
    const speed = Math.hypot(velocity.x, velocity.y)
    if (speed < BODY.throwFrom) {
      this.rest(this.hand)
      return false
    }
    const scale = speed > BODY.throwAt ? BODY.throwAt / speed : 1
    this.place(this.hand)
    this.body.setLinearDamping(BODY.drag)
    this.collider.setCollisionGroups(SOLID)
    this.body.setLinvel(
      { x: (velocity.x * scale) / PX, y: (velocity.y * scale) / PX },
      true,
    )
    this.mode = 'coasting'
    return true
  }

  /** A push, as a change of velocity in pixels per second: a poke. The tether brings it back. */
  nudge(velocity: Point) {
    if (this.mode === 'held') return
    if (this.mode === 'resting') {
      this.place(this.anchorAt)
      this.tether()
    }
    const now = this.body.linvel()
    this.body.setLinvel(
      { x: now.x + velocity.x / PX, y: now.y + velocity.y / PX },
      true,
    )
  }

  /** Puts the figure, still, at a point: no travel, no throw. */
  rest(point: Point) {
    this.untether()
    this.collider.setCollisionGroups(GHOST)
    this.mode = 'resting'
    this.owed = 0
    this.anchorAt = { ...point }
    this.movePin()
    this.place(point)
  }

  /**
   * Moves time on by `seconds`, in fixed steps. A long frame is caught up by
   * a few steps at most and the rest is dropped.
   */
  advance(seconds: number): Advanced {
    if (this.mode === 'resting' || this.mode === 'held') {
      this.owed = 0
      return NOTHING
    }
    this.owed = Math.min(
      this.owed + Math.max(0, seconds),
      BODY.catchUp * STEP + STEP / 2,
    )
    let bumps: Array<Bump> | undefined
    let landed: Point | undefined
    while (this.owed >= STEP) {
      this.owed -= STEP
      const into = this.body.linvel()
      this.before = this.after
      this.world.step(this.events)
      const t = this.body.translation()
      this.after = { x: t.x * PX, y: t.y * PX }
      this.events.drainCollisionEvents((one, two, started) => {
        if (!started) return
        const side = this.sides.get(one) ?? this.sides.get(two)
        if (!side) return
        const speed =
          (side === 'left'
            ? -into.x
            : side === 'right'
              ? into.x
              : side === 'top'
                ? -into.y
                : into.y) * PX
        if (speed >= BODY.bumpFrom) (bumps ??= []).push({ side, speed })
      })
      const v = this.body.linvel()
      const speed = Math.hypot(v.x, v.y) * PX
      if (this.mode === 'coasting' && speed < BODY.coastBelow) {
        landed = { ...this.after }
        this.rest(landed)
        break
      }
      if (
        this.mode === 'tethered' &&
        speed < BODY.restBelow &&
        Math.hypot(
          this.after.x - this.anchorAt.x,
          this.after.y - this.anchorAt.y,
        ) < BODY.restWithin
      ) {
        this.rest(this.anchorAt)
        break
      }
    }
    return bumps || landed ? { bumps: bumps ?? [], landed } : NOTHING
  }

  private movePin() {
    this.pin.setTranslation(
      { x: this.anchorAt.x / PX, y: this.anchorAt.y / PX },
      true,
    )
  }

  /** Puts the body, still, at a point, as the simulation's own state. */
  private place(point: Point) {
    this.before = { ...point }
    this.after = { ...point }
    this.body.setTranslation({ x: point.x / PX, y: point.y / PX }, true)
    this.body.setLinvel({ x: 0, y: 0 }, true)
  }

  private pace(rate: number) {
    if (Math.abs(rate - this.rate) < 0.01) return
    this.rate = rate
    if (this.joint) {
      this.untether()
      this.tether()
    }
  }

  private tether() {
    this.mode = 'tethered'
    // Travel is not stopped by the edges: where it is sent is already inside them, and an arrival beside one should settle, not rattle.
    this.collider.setCollisionGroups(GHOST)
    // The joint is a spring along the line to the pin, so damping it would leave any sideways motion to orbit for ever. The body's own damping acts in every direction.
    this.body.setLinearDamping(2 * this.rate * BODY.damping)
    if (this.joint) return
    const zero = { x: 0, y: 0 }
    this.joint = this.world.createImpulseJoint(
      this.rapier.JointData.spring(
        0,
        MASS * this.rate * this.rate,
        0,
        zero,
        zero,
      ),
      this.pin,
      this.body,
      true,
    )
  }

  private untether() {
    if (!this.joint) return
    this.world.removeImpulseJoint(this.joint, true)
    this.joint = undefined
  }
}
