// SOURCING: @dimforge/rapier2d-compat 0.21 (one World on a fixed step that every figure's bodies are in, its event queue and its physics hooks, collision groups as the bits a collider is and the bits it meets), imported on demand so its inlined WASM is a chunk of its own. Hand-rolled: the count of steps each figure has lived through. Rapier steps a world; it does not say who asked, and two figures that each pace the world against the display would otherwise run its time twice.
import type RAPIER from '@dimforge/rapier2d-compat'
import type { Collider, EventQueue, World } from '@dimforge/rapier2d-compat'

export type Rapier = typeof RAPIER

/** CSS pixels to a metre: Kit, 32 pixels tall, is a metre-high fox. */
export const PX = 32
/** Metres per second squared, downward: snappier than Earth for a creature this size. */
export const GRAVITY = 30
/** Rapier's fixed step, in seconds. */
export const STEP = 1 / 60

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

/** A figure with a body in the world. */
export type Figure = 'kit' | 'theo'

/**
 * What a collider is, as bits. Each collider says which of these it is and
 * which it meets; two touch when each is among what the other meets.
 */
export const IS = {
  /** Kit's body. */
  kit: 0x0001,
  /** Kit's body in the air with nowhere it is aimed: thrown, flung, knocked or falling. */
  kitLoose: 0x0002,
  /** The surfaces Kit stands on and the edges that stop it. */
  ground: 0x0004,
  /** Theo's body. */
  theo: 0x0008,
  /** Theo's body let go while moving. */
  theoThrown: 0x0010,
  /** The window's edges as Theo meets them. */
  edge: 0x0020,
} as const

/** Collision groups for a collider that is `is` and meets `meets`. */
export const groups = (is: number, meets: number) =>
  ((is << 16) | (meets & 0xffff)) >>> 0

/** How many steps a figure has lived through, against how many the world has taken. */
export interface Clock {
  lived: number
}

/** What a figure does around each step of the world it is in. */
export interface Member {
  /** The world is about to step. */
  readonly before?: () => void
  /** The world has stepped. */
  readonly after?: () => void
  /** Two colliders came into contact in the step just taken. */
  readonly met?: (one: number, two: number) => void
  /** Whether a contact between these two is solid, when it is this member's to say. */
  readonly solid?: (one: number, two: number) => boolean | undefined
}

/** A figure may fall this many steps behind the world before the rest are let go. */
const BEHIND = 8

const STILL = { x: 0, y: 0 }

/**
 * The one physical world the figures are in. Each figure puts its own bodies
 * in it and says what they are (`IS`), so Kit's ground is not Theo's and a
 * thrown Theo can still strike Kit.
 *
 * Whoever is moving steps it. When two are, each keeps a count of the steps
 * it has lived through (`pass`), and a step one of them took is not taken
 * again for the other.
 */
export class FigureWorld {
  readonly world: World
  private readonly events: EventQueue
  private readonly members = new Set<Member>()
  private readonly figures = new Map<
    Figure,
    { collider: Collider; into: { x: number; y: number } }
  >()
  private readonly hooks
  private taken = 0

  constructor(rapier: Rapier) {
    this.world = new rapier.World({ x: 0, y: GRAVITY })
    this.world.timestep = STEP
    // Rapier's JS step runs the hooks only beside an event queue.
    this.events = new rapier.EventQueue(true)
    const { SolverFlags } = rapier
    this.hooks = {
      filterContactPair: (one: number, two: number) => {
        for (const member of this.members) {
          const solid = member.solid?.(one, two)
          if (solid !== undefined)
            return solid ? SolverFlags.COMPUTE_IMPULSE : SolverFlags.EMPTY
        }
        return SolverFlags.COMPUTE_IMPULSE
      },
      filterIntersectionPair: () => true,
    }
  }

  free() {
    this.members.clear()
    this.figures.clear()
    this.events.free()
    this.world.free()
  }

  /** A figure comes into the world. Returns its way out. */
  join(member: Member): () => void {
    this.members.add(member)
    return () => {
      this.members.delete(member)
    }
  }

  /** Says which collider is a figure's body, so the other figure can find it; `undefined` when it has gone. */
  name(figure: Figure, collider: Collider | undefined) {
    if (collider) this.figures.set(figure, { collider, into: STILL })
    else this.figures.delete(figure)
  }

  /** A figure's body, when it has one here. */
  figure(figure: Figure): Collider | undefined {
    return this.figures.get(figure)?.collider
  }

  /** Whose body a collider is. */
  who(handle: number): Figure | undefined {
    for (const [figure, { collider }] of this.figures)
      if (collider.handle === handle) return figure
    return undefined
  }

  /** How fast a figure was moving as the last step began, in metres per second. */
  into(figure: Figure): { x: number; y: number } {
    return this.figures.get(figure)?.into ?? STILL
  }

  /** Steps taken since the world began. */
  get steps() {
    return this.taken
  }

  /** Moves the world on by one step, for everything in it. */
  step() {
    for (const figure of this.figures.values()) {
      const moving = figure.collider.parent()?.linvel()
      figure.into = moving ? { x: moving.x, y: moving.y } : STILL
    }
    for (const member of this.members) member.before?.()
    this.world.step(this.events, this.hooks)
    this.taken++
    let met: Array<[number, number]> | undefined
    this.events.drainCollisionEvents((one, two, started) => {
      if (started) (met ??= []).push([one, two])
    })
    for (const member of this.members) member.after?.()
    if (met)
      for (const [one, two] of met)
        for (const member of this.members) member.met?.(one, two)
  }

  /**
   * One step of time for the figure whose clock this is: a step the world has
   * already taken that the figure has not lived through, or else a new one.
   */
  pass(clock: Clock) {
    if (this.taken - clock.lived > BEHIND) clock.lived = this.taken - BEHIND
    if (clock.lived < this.taken) {
      clock.lived++
      return
    }
    this.step()
    clock.lived = this.taken
  }
}

let shared: FigureWorld | undefined
let inside = 0

/** Comes into the world the figures on the page share, making it if no one is in it yet. Leave with `leaveWorld`. */
export function enterWorld(rapier: Rapier): FigureWorld {
  shared ??= new FigureWorld(rapier)
  inside++
  return shared
}

/** Leaves the shared world; the last one out frees it. */
export function leaveWorld() {
  if (inside === 0) return
  inside--
  if (inside > 0) return
  shared?.free()
  shared = undefined
}

/** The shared world, while any figure is in it. */
export const theWorld = () => shared
