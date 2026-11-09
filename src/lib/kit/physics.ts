// SOURCING: @dimforge/rapier2d-compat 0.21 (Rapier 2D: the world and its fixed step, Kit's rigid body switched between kinematic and dynamic, kinematic colliders that follow the shell's surfaces, fixed walls, the kinematic character controller for walking, a shape cast for what is under Kit's feet, physics hooks for surfaces Kit passes up through and lands on, sleeping), imported on demand so its inlined WASM is a chunk of its own; stage.ts for where surfaces are and where Kit's feet sit in its frame. Hand-rolled: the launch velocity that lands a ballistic jump on a point and its in-flight correction, closed-form projectile algebra that Rapier, a simulator, does not solve for.
import type RAPIER from '@dimforge/rapier2d-compat'
import type {
  Collider,
  EventQueue,
  KinematicCharacterController,
  RigidBody,
  World,
} from '@dimforge/rapier2d-compat'
import { FEET, KIT_SIZE } from './stage'
import type { PerchLine, PerchName } from './stage'

type Rapier = typeof RAPIER

/** CSS pixels to a metre: Kit, 32 pixels tall, is a metre-high fox. */
export const PX = 32
/** Metres per second squared, downward: snappier than Earth for a creature this size. */
export const GRAVITY = 30
/** Rapier's fixed step, in seconds. */
export const STEP = 1 / 60

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

let loading: Promise<Rapier> | undefined

/** Loads Rapier once, on first need; a failure lets a later call try again. */
export function loadRapier(): Promise<Rapier> {
  loading ??= import('@dimforge/rapier2d-compat')
    .then(async (module) => {
      await module.default.init()
      return module.default
    })
    .catch((error: unknown) => {
      loading = undefined
      throw error
    })
  return loading
}

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

/**
 * Kit's physical world: one body for Kit, a thin kinematic slab under each
 * surface's line, and walls at the window's edges. Surfaces are one-way:
 * Kit rises through them and is caught on top only while coming down.
 */
export class KitWorld {
  private readonly world: World
  private readonly body: RigidBody
  private readonly collider: Collider
  private readonly controller: KinematicCharacterController
  private readonly slabs = new Map<PerchName, Slab>()
  private readonly byCollider = new Map<number, PerchName>()
  private readonly walls: RigidBody[] = []
  private feetBefore = 0
  private fallingBefore = true
  /** Surfaces that catch Kit now; all of them unless a jump aims at one. */
  private catches: (name: PerchName) => boolean = () => true
  private dynamic = false
  private readonly hooks
  private readonly probe
  /** Rapier's JS step runs the hooks only beside an event queue. */
  private readonly events: EventQueue
  /** A surface was added since the last step, which the queries do not see yet. */
  private unseen = false

  constructor(
    private readonly rapier: Rapier,
    x: number,
    y: number,
  ) {
    this.world = new rapier.World({ x: 0, y: GRAVITY })
    this.world.timestep = STEP
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
      this.world.createCollider(
        rapier.ColliderDesc.cuboid(WALL, WALL).setRestitution(0.2),
        wall,
      )
      this.walls.push(wall)
    }
    this.probe = new rapier.Capsule(SHAFT, HALF.x)
    this.events = new rapier.EventQueue(true)
    this.controller = this.world.createCharacterController(0.01)
    this.controller.setUp({ x: 0, y: -1 })
    this.controller.setSlideEnabled(true)
    this.controller.enableSnapToGround(10 / PX)
    this.controller.setApplyImpulsesToDynamicBodies(false)
    const { SolverFlags } = rapier
    this.hooks = {
      filterContactPair: (one: number, two: number) => {
        const name = this.byCollider.get(one) ?? this.byCollider.get(two)
        if (name === undefined) return SolverFlags.COMPUTE_IMPULSE
        const slab = this.slabs.get(name)
        const top = slab ? slab.line.y / PX : 0
        return this.catches(name) &&
          this.fallingBefore &&
          this.feetBefore <= top + CATCH
          ? SolverFlags.COMPUTE_IMPULSE
          : SolverFlags.EMPTY
      },
      filterIntersectionPair: () => true,
    }
  }

  destroy() {
    this.events.free()
    this.world.free()
  }

  private step() {
    this.remember()
    this.world.step(this.events, this.hooks)
    this.unseen = false
  }

  /** Steps once, if a surface was just added, so the queries that follow see it. */
  private see() {
    if (this.unseen) this.step()
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
          this.rapier.ColliderDesc.cuboid(half, SLAB).setFriction(0.9),
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
  }

  /**
   * Kit leaves the ground at `velocity` (metres per second), bouncing by
   * `bounce` off what it hits; while `aim` is given, only that surface and
   * the floor catch it.
   */
  launch(velocity: { x: number; y: number }, bounce: number, aim?: PerchName) {
    this.dynamic = true
    this.body.setBodyType(this.rapier.RigidBodyType.Dynamic, true)
    this.collider.setRestitution(bounce)
    this.body.setLinvel(velocity, true)
    this.catches =
      aim === undefined
        ? () => true
        : (name) => name === aim || name === 'floor'
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
    const before = this.body.linvel().y
    this.step()
    const after = this.body.linvel().y
    const impact = before > 1.5 && after < before * 0.5 ? before : 0
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
        !this.byCollider.has(collider.handle),
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
    this.feetBefore = this.body.translation().y + HALF.y
    this.fallingBefore = this.body.linvel().y >= -0.05
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
