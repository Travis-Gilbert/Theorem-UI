// SOURCING: @dimforge/rapier2d-compat 0.21 (one rigid body for the whole figure, weightless, dynamic while it travels or is thrown; a spring joint from a kinematic pin for the tether's pull, with the body's linear damping to settle it; fixed walls at the window's edges; continuous collision detection; collision events for contact); lib/world for the world itself, which Kit's body is in too, its fixed step, its scale and what each collider in it is; ./feel for the numbers that are the person's to set (drag, bounce, where a throw begins, pace, settle). Hand-rolled: the accumulator with bounded catch-up and the interpolation between steps (Rapier steps a world, it does not pace one against a display), and the release velocity read off the hand's last samples.
import type {
  Collider,
  ImpulseJoint,
  RigidBody,
  World,
} from '@dimforge/rapier2d-compat'
import { FigureWorld, IS, PX, STEP, groups } from '@/lib/world'
import type { Clock, Rapier } from '@/lib/world'
import { FEEL, feelRevision } from './feel'

export interface Point {
  x: number
  y: number
}

export type Side = 'left' | 'right' | 'top' | 'bottom'

/**
 * The figure met something on this side of it, closing at `speed` pixels per
 * second: an edge of the page, or Kit when `against` says so.
 */
export interface Bump {
  readonly side: Side
  readonly speed: number
  readonly against?: 'kit'
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

/** What is not a matter of taste. The numbers a person may set are in ./feel. */
export const BODY = {
  /** Steps run in one frame at most. Time past that is dropped, so a tab that stalled does not lurch when it wakes. */
  catchUp: 5,
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

/** How fast the tether pulls, in radians per second, for a move meant to take about `over` milliseconds, at the pace the person set. */
export const tetherRate = (over: number) =>
  Math.min(20, Math.max(5, 6000 / Math.max(120, over))) * FEEL.pace

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

/** How fast something moving at (x, y) goes into this side. */
const closing = (side: Side, x: number, y: number) =>
  side === 'left' ? -x : side === 'right' ? x : side === 'top' ? -y : y

/**
 * Theo's figure as one physical body on the page, in pixels. It owns where
 * the figure is; what the face inside it does is the rig's. The page calls
 * `anchor` when the figure means to be somewhere, `shift` when the layout
 * moved that somewhere under it, `hold` and `release` for the hand, `nudge`
 * for a poke, and `advance` once a frame.
 *
 * The edges of the window are solid to a thrown figure only. Deliberate
 * travel passes them by: its destinations are inside them already.
 *
 * Kit's body is in the same world (lib/world). A thrown figure strikes Kit
 * where it stands; travelling or at rest the figure passes Kit by, but Kit
 * loose in the air strikes it, and the tether brings it back. Given no
 * world, it makes one of its own.
 */
export class FaceBody {
  private readonly shared: FigureWorld
  private readonly own: boolean
  private readonly world: World
  private readonly body: RigidBody
  private readonly collider: Collider
  private readonly pin: RigidBody
  private readonly walls: Array<RigidBody> = []
  private readonly sides = new Map<number, Side>()
  private readonly leave: () => void
  private readonly clock: Clock = { lived: 0 }
  /** What the steps since `advance` last answered met, and where a coast ended in them. */
  private bumps: Array<Bump> = []
  private landed: Point | undefined
  private joint: ImpulseJoint | undefined
  /** About how long the move under way was meant to take, in milliseconds. */
  private over = 620
  private rate = tetherRate(620)
  /** The feel this body was last set up for. */
  private feel = feelRevision()
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
    shared?: FigureWorld,
  ) {
    this.own = shared === undefined
    this.shared = shared ?? new FigureWorld(rapier)
    this.world = this.shared.world
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
        // The world has Kit's gravity; the figure floats in it.
        .setGravityScale(0)
        .lockRotations()
        .setCcdEnabled(true)
        .setCanSleep(false),
    )
    this.collider = this.world.createCollider(
      rapier.ColliderDesc.cuboid(0.5, 0.5)
        .setMass(MASS)
        .setFriction(0)
        .setRestitution(FEEL.bounce)
        .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
      this.body,
    )
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      const wall = this.world.createRigidBody(rapier.RigidBodyDesc.fixed())
      const collider = this.world.createCollider(
        rapier.ColliderDesc.cuboid(WALL, WALL)
          .setFriction(0)
          .setCollisionGroups(groups(IS.edge, IS.theo)),
        wall,
      )
      this.walls.push(wall)
      this.sides.set(collider.handle, side)
    }
    this.regroup()
    this.resize(size.width, size.height)
    this.shared.name('theo', this.collider)
    this.leave = this.shared.join({
      after: () => this.stepped(),
      met: (one, two) => this.met(one, two),
    })
  }

  destroy() {
    this.leave()
    if (this.shared.figure('theo') === this.collider)
      this.shared.name('theo', undefined)
    if (this.own) {
      this.shared.free()
      return
    }
    // The world is someone else's too: only what the figure put in it goes. Its tether goes with its body.
    this.world.removeRigidBody(this.body)
    this.world.removeRigidBody(this.pin)
    for (const wall of this.walls) this.world.removeRigidBody(wall)
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
    if (over !== undefined) this.over = over
    this.pace(tetherRate(this.over))
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
    if (this.mode === 'resting') {
      // At rest nothing is simulated, but its body is still where Kit would strike it.
      this.place(this.anchorAt)
      return
    }
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
      this.regroup()
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
    if (speed < FEEL.throwFrom) {
      this.rest(this.hand)
      return false
    }
    const scale = speed > BODY.throwAt ? BODY.throwAt / speed : 1
    this.place(this.hand)
    this.body.setLinearDamping(FEEL.drag)
    this.body.setLinvel(
      { x: (velocity.x * scale) / PX, y: (velocity.y * scale) / PX },
      true,
    )
    this.mode = 'coasting'
    this.clock.lived = this.shared.steps
    this.regroup()
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
    this.mode = 'resting'
    this.regroup()
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
    if (this.feel !== feelRevision()) this.retune()
    if (!this.simulated()) {
      this.owed = 0
      this.clock.lived = this.shared.steps
      return this.since()
    }
    this.owed = Math.min(
      this.owed + Math.max(0, seconds),
      BODY.catchUp * STEP + STEP / 2,
    )
    // A step Kit has already taken the world through is one the figure has lived too.
    while (this.owed >= STEP && this.simulated()) {
      this.owed -= STEP
      this.shared.pass(this.clock)
    }
    return this.since()
  }

  /** Whether the simulation is what moves it now. */
  private simulated() {
    return this.mode === 'tethered' || this.mode === 'coasting'
  }

  /** What has been met and where a coast ended since this was last asked. */
  private since(): Advanced {
    if (this.bumps.length === 0 && !this.landed) return NOTHING
    const out = { bumps: this.bumps, landed: this.landed }
    this.bumps = []
    this.landed = undefined
    return out
  }

  /** The world stepped, whoever asked it to. */
  private stepped() {
    if (this.mode === 'held') return
    const v = this.body.linvel()
    const speed = Math.hypot(v.x, v.y) * PX
    if (this.mode === 'resting') {
      // Still at rest unless something in the world moved it: Kit, loose in the air. The tether brings it back.
      if (speed < BODY.restBelow) return
      this.before = { ...this.anchorAt }
      this.after = { ...this.anchorAt }
      this.tether()
      this.clock.lived = this.shared.steps
    }
    this.before = this.after
    const t = this.body.translation()
    this.after = { x: t.x * PX, y: t.y * PX }
    if (this.mode === 'coasting' && speed < BODY.coastBelow) {
      this.landed = { ...this.after }
      this.rest(this.landed)
    } else if (
      this.mode === 'tethered' &&
      speed < BODY.restBelow &&
      Math.hypot(
        this.after.x - this.anchorAt.x,
        this.after.y - this.anchorAt.y,
      ) < BODY.restWithin
    )
      this.rest(this.anchorAt)
  }

  /** Two colliders came into contact in the step just taken. */
  private met(one: number, two: number) {
    const mine = this.collider.handle
    if (one !== mine && two !== mine) return
    const other = one === mine ? two : one
    const into = this.shared.into('theo')
    const edge = this.sides.get(other)
    if (edge) {
      const speed = closing(edge, into.x, into.y) * PX
      if (speed >= BODY.bumpFrom) this.bumps.push({ side: edge, speed })
      return
    }
    if (this.shared.who(other) !== 'kit') return
    const kit = this.shared.figure('kit')
    if (!kit) return
    // Which side of the figure Kit is on, measured against the figure's own shape.
    const here = this.body.translation()
    const there = kit.translation()
    const dx = (there.x - here.x) / Math.max(1, this.size.width)
    const dy = (there.y - here.y) / Math.max(1, this.size.height)
    const side: Side =
      Math.abs(dx) >= Math.abs(dy)
        ? dx < 0
          ? 'left'
          : 'right'
        : dy < 0
          ? 'top'
          : 'bottom'
    const theirs = this.shared.into('kit')
    const speed = closing(side, into.x - theirs.x, into.y - theirs.y) * PX
    if (speed >= BODY.bumpFrom) this.bumps.push({ side, speed, against: 'kit' })
  }

  /** What the figure's body is and meets now. */
  private regroup() {
    const { theo, theoThrown, edge, kit, kitLoose } = IS
    this.collider.setCollisionGroups(
      this.mode === 'held'
        ? groups(0, 0)
        : this.mode === 'coasting'
          ? groups(theo | theoThrown, edge | kit | kitLoose)
          : groups(theo, kitLoose),
    )
  }

  /** The person changed how it should feel: what is under way takes the new numbers up. */
  private retune() {
    this.feel = feelRevision()
    this.collider.setRestitution(FEEL.bounce)
    if (this.mode === 'coasting') this.body.setLinearDamping(FEEL.drag)
    // The pace is taken up whatever it is doing: at rest there is no tether to redo, and the next poke fastens one at this rate.
    this.pace(tetherRate(this.over))
    if (this.mode === 'tethered')
      this.body.setLinearDamping(2 * this.rate * FEEL.settle)
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
    if (this.mode !== 'tethered') this.clock.lived = this.shared.steps
    this.mode = 'tethered'
    // Travel is not stopped by the edges: where it is sent is already inside them, and an arrival beside one should settle, not rattle.
    this.regroup()
    // The joint is a spring along the line to the pin, so damping it would leave any sideways motion to orbit for ever. The body's own damping acts in every direction.
    this.body.setLinearDamping(2 * this.rate * FEEL.settle)
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
