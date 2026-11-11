// SOURCING: @dimforge/rapier2d-compat 0.21 (Rapier 2D: Kit's rigid body switched between kinematic and dynamic, kinematic colliders that follow the shell's surfaces, fixed walls, the kinematic character controller for walking, shape casts for what is under Kit's feet and for what is flying at it, a contact filter for surfaces Kit passes up through and lands on, a collider's shape changed for a duck, sleeping); lib/world for the world itself, which Theo's body is in too, its fixed step and its scale; stage.ts for where surfaces are and where Kit's feet sit in its frame. Hand-rolled: the launch velocity that lands a ballistic jump on a point and its in-flight correction, closed-form projectile algebra that Rapier, a simulator, does not solve for.
import type {
  Collider,
  KinematicCharacterController,
  RigidBody,
  World,
} from '@dimforge/rapier2d-compat'
import { FigureWorld, GRAVITY, IS, PX, STEP, groups } from '../world'
import type { Clock, Rapier } from '../world'
import { FEET, KIT_SIZE } from './stage'
import type { PerchLine, PerchName } from './stage'

export { GRAVITY, PX, STEP, loadRapier } from '../world'

/** Half of Kit's body, in metres: a capsule narrower than the frame, its bottom on the feet row. */
const HALF = { x: 9 / PX, y: 11 / PX }
/** The capsule's straight half between its round ends. */
const SHAFT = HALF.y - HALF.x
/** Half the thickness of a surface's collider, in metres; its top is the surface's line. */
const SLAB = 4 / PX
/** Half the thickness of a wall, in metres. */
const WALL = 1
/** How far above a surface's top Kit's feet may be and still be caught by it, in metres. */
const CATCH = 3 / PX
/** How far clear of a surface walking Kit's feet are kept, in metres: the controller's offset. */
const GAP = 0.01
/** How far below its feet Kit looks for ground, in metres. */
const PROBE = 3 / PX
/** Ducked, Kit is a ball this big on its feet, in metres: about half as tall as it stands. */
const DUCK = 6 / PX
/** How far ahead Kit sees something flying at it, in seconds. */
const HORIZON = 0.6
/** Slower than this, in metres per second, a thrown Theo is not something to get out of the way of. */
const SLOWEST = 4
/** Arriving slower than this, in metres per second, it would not so much as nudge Kit. */
const ARRIVING = 2
/** The longest Theo is said to be over Kit for, in seconds: one that stops there is over it this long. */
const LINGER = 1
/** How far clear of Theo a jump over it means to be, in metres. */
const CLEAR = 6 / PX
/** The highest Kit can jump to get over something, in metres. */
const HIGHEST = 2.8
/** How fast Kit is sent sideways off Theo when it lands on it, in metres per second. */
const TUMBLE = 3
/** How many steps after Theo struck it Kit can be struck again, if nothing has thrown it since. */
const STRUCK_FOR = 45

const STILL = { x: 0, y: 0 }

/** The centre of Kit's body, in metres, for a frame whose top-left is (x, y) in pixels. */
export const bodyOf = (x: number, y: number) => ({
  x: (x + KIT_SIZE / 2) / PX,
  y: (y + FEET) / PX - HALF.y,
})

/** The frame's top-left in pixels for a body centred at `t`, in metres. */
export const frameOf = (t: { x: number; y: number }): [number, number] => [
  t.x * PX - KIT_SIZE / 2,
  (t.y + HALF.y) * PX - FEET,
]

/**
 * The velocity, in metres per second, that throws a body from `from` to
 * `to` (both in metres, y down) passing `rise` metres above the higher of
 * the two, under `gravity`.
 */
export function launchVelocity(
  from: { x: number; y: number },
  to: { x: number; y: number },
  rise: number,
  gravity = GRAVITY,
): { x: number; y: number; time: number } {
  const apex = Math.min(from.y, to.y) - Math.max(0.05, rise)
  const up = Math.sqrt(2 * gravity * (from.y - apex))
  const time = up / gravity + Math.sqrt((2 * (to.y - apex)) / gravity)
  return { x: (to.x - from.x) / time, y: -up, time }
}

/**
 * The time until a body at height `y` moving at `vy` (y down) falls to
 * `ground`, or undefined when it never gets there.
 */
export function timeToFall(
  y: number,
  vy: number,
  ground: number,
  gravity = GRAVITY,
): number | undefined {
  const reach = vy * vy + 2 * gravity * (ground - y)
  if (reach < 0) return undefined
  const time = (-vy + Math.sqrt(reach)) / gravity
  return time > 0 ? time : undefined
}

interface Slab {
  readonly body: RigidBody
  readonly collider: Collider
  line: PerchLine
}

/** What a step of flight met: an impact's downward speed, and the surface under Kit's feet. */
export interface Flight {
  readonly impact: number
  readonly under: PerchName | undefined
}

/** Theo, thrown, is on its way to where Kit stands. */
export interface Coming {
  /** Seconds until it gets there. */
  readonly in: number
  /** The side it comes from: -1 from Kit's left, 1 from its right. */
  readonly from: -1 | 1
  /** Whether it passes over Kit if Kit ducks. */
  readonly over: boolean
  /** How far Kit's feet must rise to be clear of it, in metres; `undefined` when no jump of Kit's gets over it. */
  readonly rise: number | undefined
  /** Seconds it is over where Kit stands for, slowing as it is: at most `LINGER`, which also stands for one that stops there. */
  readonly passing: number
}

/**
 * Kit's body in the figures' world: one body for Kit, a thin kinematic slab
 * under each surface's line, and walls at the window's edges. Surfaces are
 * one-way: Kit rises through them and is caught on top only while coming
 * down.
 *
 * Theo's body is in the same world. A thrown Theo strikes Kit where it
 * stands, and Kit loose in the air strikes Theo, once: after that it goes
 * past, so it never comes to rest on something that is not a surface. Given
 * no world, it makes one of its own.
 */
export class KitWorld {
  private readonly shared: FigureWorld
  private readonly own: boolean
  private readonly world: World
  private readonly body: RigidBody
  private readonly collider: Collider
  private readonly controller: KinematicCharacterController
  private readonly slabs = new Map<PerchName, Slab>()
  private readonly byCollider = new Map<number, PerchName>()
  private readonly walls: RigidBody[] = []
  /** The walls' colliders: with the surface Kit stands on, all that walking is stopped by. */
  private readonly edges = new Set<number>()
  private readonly leave: () => void
  private readonly clock: Clock = { lived: 0 }
  private feetBefore = 0
  private fallingBefore = true
  private fallBefore = 0
  /** The hardest landing since `fly` was last asked, in metres per second. */
  private hit = 0
  /** Surfaces that catch Kit now; all of them unless a jump aims at one. */
  private catches: (name: PerchName) => boolean = () => true
  private dynamic = false
  /** In the air with nowhere it is aimed. */
  private loose = false
  /** The step at which Theo last struck it; until it lands, or a moment passes, it is not struck again. */
  private struckAt: number | undefined
  /** The person has it: its body is not where it is, and nothing meets it. */
  private away = false
  private ducked = false
  private readonly probe
  private readonly low
  /** A surface was added since the last step, which the queries do not see yet. */
  private unseen = false
  /** Theo struck Kit, moving at this many metres per second; `airborne` when the two met in the air and the collision has already moved Kit. */
  onStruck:
    | ((velocity: { x: number; y: number }, airborne: boolean) => void)
    | undefined
  /** Theo, thrown, is on its way to where Kit stands. Said every step until it has passed. */
  onComing: ((coming: Coming) => void) | undefined

  constructor(
    private readonly rapier: Rapier,
    x: number,
    y: number,
    shared?: FigureWorld,
  ) {
    this.own = shared === undefined
    this.shared = shared ?? new FigureWorld(rapier)
    this.world = this.shared.world
    const start = bodyOf(x, y)
    this.body = this.world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(start.x, start.y)
        .lockRotations()
        .setCcdEnabled(true),
    )
    this.collider = this.world.createCollider(
      rapier.ColliderDesc.capsule(SHAFT, HALF.x)
        .setFriction(0.7)
        .setRestitutionCombineRule(rapier.CoefficientCombineRule.Max)
        .setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS),
      this.body,
    )
    for (let side = 0; side < 3; side++) {
      const wall = this.world.createRigidBody(rapier.RigidBodyDesc.fixed())
      const collider = this.world.createCollider(
        rapier.ColliderDesc.cuboid(WALL, WALL)
          .setRestitution(0.2)
          .setCollisionGroups(groups(IS.ground, IS.kit)),
        wall,
      )
      this.walls.push(wall)
      this.edges.add(collider.handle)
    }
    this.probe = new rapier.Capsule(SHAFT, HALF.x)
    this.low = new rapier.Ball(DUCK)
    this.controller = this.world.createCharacterController(0.01)
    this.controller.setUp({ x: 0, y: -1 })
    this.controller.setSlideEnabled(true)
    this.controller.enableSnapToGround(10 / PX)
    this.controller.setApplyImpulsesToDynamicBodies(false)
    this.regroup()
    this.shared.name('kit', this.collider)
    this.leave = this.shared.join({
      before: () => this.remember(),
      after: () => this.after(),
      met: (one, two) => this.met(one, two),
      solid: (one, two) => {
        const name = this.byCollider.get(one) ?? this.byCollider.get(two)
        if (name === undefined) return undefined
        const slab = this.slabs.get(name)
        const top = slab ? slab.line.y / PX : 0
        return (
          this.catches(name) &&
          this.fallingBefore &&
          this.feetBefore <= top + CATCH
        )
      },
    })
  }

  destroy() {
    this.leave()
    if (this.shared.figure('kit') === this.collider)
      this.shared.name('kit', undefined)
    if (this.own) {
      this.shared.free()
      return
    }
    // The world is someone else's too: only what Kit put in it goes.
    this.world.removeCharacterController(this.controller)
    for (const slab of this.slabs.values())
      this.world.removeRigidBody(slab.body)
    for (const wall of this.walls) this.world.removeRigidBody(wall)
    this.world.removeRigidBody(this.body)
  }

  /** A step Kit needs taken now, whoever else has stepped: one that moves it along the ground, or shows it a new surface. */
  private step() {
    this.shared.step()
    this.clock.lived = this.shared.steps
  }

  /** Steps once, if a surface was just added, so the queries that follow see it. */
  private see() {
    if (this.unseen) this.step()
  }

  /** What Kit's body is and meets now. */
  private regroup() {
    if (this.away) {
      this.collider.setCollisionGroups(groups(0, 0))
      return
    }
    const struck = this.struckAt !== undefined
    const free = this.loose && !struck
    this.collider.setCollisionGroups(
      groups(
        IS.kit | (free ? IS.kitLoose : 0),
        IS.ground | (struck ? 0 : IS.theoThrown) | (free ? IS.theo : 0),
      ),
    )
  }

  private after() {
    // Any step, whoever took it, shows the queries what was added.
    this.unseen = false
    const falling = this.body.linvel().y
    if (
      this.dynamic &&
      this.fallBefore > 1.5 &&
      falling < this.fallBefore * 0.5 &&
      this.fallBefore > this.hit
    )
      this.hit = this.fallBefore
    if (
      this.struckAt !== undefined &&
      !this.dynamic &&
      this.shared.steps - this.struckAt > STRUCK_FOR
    ) {
      this.struckAt = undefined
      this.regroup()
    }
    if (!this.onComing) return
    const coming = this.coming()
    if (coming) this.onComing(coming)
  }

  private met(one: number, two: number) {
    const mine = this.collider.handle
    if (one !== mine && two !== mine) return
    if (this.shared.who(one === mine ? two : one) !== 'theo') return
    const theo = this.shared.figure('theo')
    this.struckAt = this.shared.steps
    this.regroup()
    if (this.dynamic && theo) {
      // It does not come to rest on Theo: it tumbles off the nearer side.
      const now = this.body.linvel()
      if (Math.abs(now.x) < TUMBLE) {
        const off = this.body.translation().x >= theo.translation().x ? 1 : -1
        this.body.setLinvel({ x: off * TUMBLE, y: now.y }, true)
      }
    }
    this.onStruck?.({ ...this.shared.into('theo') }, this.dynamic)
  }

  /**
   * Theo, if it has been thrown and is on its way to where Kit stands: how
   * soon, from which side, and what would get Kit out of its way. Nothing
   * while Kit is in the air or in the person's hand.
   */
  coming(): Coming | undefined {
    if (this.dynamic || this.away || this.struckAt !== undefined)
      return undefined
    const theo = this.shared.figure('theo')
    const mover = theo?.parent()
    if (!theo || !mover) return undefined
    if (((theo.collisionGroups() >>> 16) & IS.theoThrown) === 0)
      return undefined
    const speed = mover.linvel()
    if (Math.hypot(speed.x, speed.y) < SLOWEST) return undefined
    const at = this.body.translation()
    // A throw dies away: it covers its speed over its drag and no more, so
    // that is as far along its line as there is to look, and how long it
    // takes to get somewhere is not the distance over the speed it has now.
    const drag = mover.linearDamping()
    const reach = drag > 0 ? 1 / drag : HORIZON
    // Against Kit as it stands, whatever it is doing about it now.
    const hit = theo.castShape(speed, this.probe, at, 0, STILL, 0, reach, true)
    const half = theo.halfExtents()
    if (!hit || !half) return undefined
    const along = hit.time_of_impact
    // What is left of its speed when it gets here.
    const left = drag > 0 ? 1 - drag * along : 1
    if (Math.hypot(speed.x, speed.y) * left < ARRIVING) return undefined
    const soon =
      drag > 0 ? (Math.log(left) / -Math.log1p(drag * STEP)) * STEP : along
    if (soon > HORIZON) return undefined
    const across = Math.max(Math.abs(speed.x), 0.01)
    // How much further along its line it is over Kit for.
    const passing = Math.min(1, (2 * half.x + 2 * HALF.x) / across)
    // And how long that takes it, slowing: for ever, if it stops there.
    const gone = drag > 0 ? 1 - drag * (along + passing) : 1
    const lingers =
      drag <= 0
        ? passing
        : gone <= 0
          ? LINGER
          : Math.min(
              LINGER,
              (Math.log(gone) / -Math.log1p(drag * STEP)) * STEP - soon,
            )
    const ducked = theo.castShape(
      speed,
      this.low,
      { x: at.x, y: at.y + HALF.y - DUCK },
      0,
      STILL,
      0,
      Math.min(reach, along + passing),
      true,
    )
    const top =
      theo.translation().y +
      speed.y * along -
      half.y -
      Math.max(0, -speed.y) * passing
    const rise = at.y + HALF.y - top + CLEAR
    return {
      in: soon,
      from: speed.x >= 0 ? -1 : 1,
      passing: lingers,
      over: ducked === null,
      rise:
        Math.abs(speed.x) >= Math.abs(speed.y) && rise > 0 && rise <= HIGHEST
          ? rise
          : undefined,
    }
  }

  /** Whether Theo, still moving from a throw, is where Kit would be if it stood up. */
  overhead(): boolean {
    const theo = this.shared.figure('theo')
    if (!theo || ((theo.collisionGroups() >>> 16) & IS.theoThrown) === 0)
      return false
    return theo.intersectsShape(this.probe, this.body.translation(), 0)
  }

  /** Kit ducks, or stands again: ducked it is about half as tall, on the same feet. */
  duck(low: boolean) {
    if (low === this.ducked) return
    this.ducked = low
    this.collider.setShape(low ? this.low : this.probe)
    this.collider.setTranslationWrtParent({ x: 0, y: low ? HALF.y - DUCK : 0 })
  }

  /** Whether Kit is in the person's hand, or has not stood anywhere yet. */
  get lifted() {
    return this.away
  }

  /** The person picked Kit up: until it is put somewhere, nothing in the world meets it. */
  lift() {
    this.away = true
    this.regroup()
  }

  /**
   * Brings the slabs and walls to where the shell's surfaces and the window
   * are now. A moved slab moves as a kinematic body, so whatever it carries
   * is carried.
   */
  sync(lines: readonly PerchLine[], width: number, height: number) {
    const seen = new Set<PerchName>()
    for (const line of lines) {
      seen.add(line.name)
      const half = Math.max(1, line.right - line.left) / 2 / PX
      const centre = {
        x: (line.left + line.right) / 2 / PX,
        y: line.y / PX + SLAB,
      }
      const slab = this.slabs.get(line.name)
      if (!slab) {
        const body = this.world.createRigidBody(
          this.rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(
            centre.x,
            centre.y,
          ),
        )
        const collider = this.world.createCollider(
          this.rapier.ColliderDesc.cuboid(half, SLAB)
            .setFriction(0.9)
            .setCollisionGroups(groups(IS.ground, IS.kit)),
          body,
        )
        this.slabs.set(line.name, { body, collider, line })
        this.byCollider.set(collider.handle, line.name)
        this.unseen = true
        continue
      }
      const before = slab.line
      if (before.right - before.left !== line.right - line.left)
        slab.collider.setHalfExtents({ x: half, y: SLAB })
      if (
        before.left !== line.left ||
        before.right !== line.right ||
        before.y !== line.y
      )
        slab.body.setNextKinematicTranslation(centre)
      slab.line = line
    }
    for (const [name, slab] of this.slabs) {
      if (seen.has(name)) continue
      this.byCollider.delete(slab.collider.handle)
      this.world.removeRigidBody(slab.body)
      this.slabs.delete(name)
    }
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height
    const [left, right, top] = this.walls as [RigidBody, RigidBody, RigidBody]
    const w = width / PX
    const h = height / PX
    const reach = Math.max(w, h) + WALL
    left.setTranslation({ x: -WALL, y: h / 2 }, true)
    right.setTranslation({ x: w + WALL, y: h / 2 }, true)
    top.setTranslation({ x: w / 2, y: -WALL }, true)
    left.collider(0).setHalfExtents({ x: WALL, y: reach })
    right.collider(0).setHalfExtents({ x: WALL, y: reach })
    top.collider(0).setHalfExtents({ x: reach, y: WALL })
  }

  private width = 0
  private height = 0

  /** Puts Kit, still, where its frame's top-left is (x, y) in pixels. */
  place(x: number, y: number) {
    this.ground()
    this.body.setTranslation(bodyOf(x, y), true)
    if (this.away) {
      this.away = false
      this.regroup()
    }
  }

  /** Kit's frame now, top-left in pixels. */
  frame(): [number, number] {
    return frameOf(this.body.translation())
  }

  /** Kit's velocity in metres per second. */
  velocity(): { x: number; y: number } {
    return this.body.linvel()
  }

  isAirborne() {
    return this.dynamic
  }

  /** Kit stands: a kinematic body the character controller moves. */
  ground() {
    if (!this.dynamic) return
    this.dynamic = false
    this.body.setBodyType(
      this.rapier.RigidBodyType.KinematicPositionBased,
      true,
    )
    this.body.setLinvel({ x: 0, y: 0 }, true)
    this.catches = () => true
    this.loose = false
    this.struckAt = undefined
    this.regroup()
  }

  /**
   * Kit leaves the ground at `velocity` (metres per second), bouncing by
   * `bounce` off what it hits; while `aim` is given, only that surface and
   * the floor catch it. With no aim it is loose, and can strike Theo.
   */
  launch(velocity: { x: number; y: number }, bounce: number, aim?: PerchName) {
    this.duck(false)
    this.dynamic = true
    this.loose = aim === undefined
    this.hit = 0
    this.clock.lived = this.shared.steps
    this.body.setBodyType(this.rapier.RigidBodyType.Dynamic, true)
    this.collider.setRestitution(bounce)
    this.body.setLinvel(velocity, true)
    this.catches =
      aim === undefined
        ? () => true
        : (name) => name === aim || name === 'floor'
    this.regroup()
  }

  /** Steers a flight's sideways speed, metres per second. */
  steer(vx: number) {
    const { y } = this.body.linvel()
    this.body.setLinvel({ x: vx, y }, true)
  }

  /**
   * One step of flight. Reports how hard Kit hit something below it, and
   * the surface under its feet once it rests there.
   */
  fly(): Flight {
    // A step Theo has already taken the world through is one Kit has flown too.
    this.shared.pass(this.clock)
    const impact = this.hit
    this.hit = 0
    return { impact, under: this.under() }
  }

  /**
   * One step of walking toward `goal` (a frame's top-left, pixels) along
   * `standing`, as far as `reach` pixels. Reports whether the ground still
   * holds Kit.
   */
  walk(goal: [number, number], reach: number, standing: PerchName): boolean {
    this.see()
    let now = this.body.translation()
    const stand = bodyOf(...goal)
    // Feet just clear of the line: a controller that starts inside a collider does not move.
    const target = { x: stand.x, y: stand.y - GAP }
    // The surface moved past Kit's feet (the layout shifted), or Kit is on it: it stands just clear.
    if (Math.abs(target.y - now.y) > 6 / PX || now.y > stand.y) {
      this.body.setTranslation({ x: now.x, y: target.y }, true)
      now = { x: now.x, y: target.y }
    }
    const dx = Math.max(-reach, Math.min(reach, (target.x - now.x) * PX)) / PX
    // To the line's clearance; snapping to the ground tells whether it still holds Kit.
    const dy = target.y - now.y
    const slab = this.slabs.get(standing)
    this.controller.computeColliderMovement(
      this.collider,
      { x: dx, y: dy },
      undefined,
      undefined,
      (collider) =>
        collider.handle === slab?.collider.handle ||
        this.edges.has(collider.handle),
    )
    const moved = this.controller.computedMovement()
    this.body.setNextKinematicTranslation({
      x: now.x + moved.x,
      y: now.y + moved.y,
    })
    this.step()
    return this.controller.computedGrounded()
  }

  private remember() {
    const falling = this.body.linvel().y
    this.feetBefore = this.body.translation().y + HALF.y
    this.fallingBefore = falling >= -0.05
    this.fallBefore = falling
  }

  /** The surface just under Kit's feet that would catch it, by a shape cast downward. */
  under(): PerchName | undefined {
    const hit = this.world.castShape(
      this.body.translation(),
      0,
      { x: 0, y: 1 },
      this.probe,
      0,
      PROBE,
      false,
      undefined,
      undefined,
      this.collider,
      this.body,
      (collider) => {
        const name = this.byCollider.get(collider.handle)
        if (name === undefined || !this.catches(name)) return false
        const slab = this.slabs.get(name)
        return (
          slab !== undefined &&
          this.body.translation().y + HALF.y <= slab.line.y / PX + CATCH
        )
      },
    )
    return hit ? this.byCollider.get(hit.collider.handle) : undefined
  }

  /** The line of a surface as the world last saw it. */
  line(name: PerchName): PerchLine | undefined {
    return this.slabs.get(name)?.line
  }

  /** Lets the world rest: a sleeping body costs nothing until it is woken. */
  sleep() {
    this.body.sleep()
  }
}
