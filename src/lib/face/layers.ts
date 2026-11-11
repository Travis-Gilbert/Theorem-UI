// SOURCING: layered animation as character rigs and game animation stacks do it (a higher layer overrides a lower one per channel, and letting go hands the channel back without a snap), with a damped spring per channel as in lib/life/energy.ts. The layer order is the handoff's (docs/plans/theo-face.md): the person's hand over a deliberate performance over a reaction over mood over identity.
import { Channels, clamp } from './channels'
import type { FeatureDef } from './channels'

/** Who may hold a channel, lowest first. A higher layer's hold wins. */
export const LAYERS = ['mood', 'reaction', 'performance', 'hand'] as const
export type Layer = (typeof LAYERS)[number]

/** How a channel should get where it is told to go. */
export interface Manner {
  /** About how long the move takes, in milliseconds. */
  readonly over?: number
  /** 0 arrives without overshoot; toward 1 it overshoots and rings. */
  readonly bounce?: number
}

interface ChannelState {
  value: number
  velocity: number
  /** One slot per layer; `undefined` is not held. */
  readonly holds: Array<number | undefined>
  omega: number
  zeta: number
  /** Added this frame, after the spring. */
  add: number
  /** Pulled toward `pullTo` by this much this frame, after `add`. */
  pull: number
  pullTo: number
}

const DEFAULT_OVER = 260
/** The stiffest a spring may be and stay stable at the engine's step. */
const MAX_OMEGA = 70
/** A move asked to take less than this is made at once. */
const SNAP_MS = 40
const omegaOf = (over: number) =>
  Math.min(MAX_OMEGA, 5.5 / (Math.max(SNAP_MS, over) / 1000))
const zetaOf = (bounce: number) => 1 - 0.78 * clamp(bounce, 0, 1)

/**
 * The face's numbers in motion. Each channel is a spring following the
 * highest layer that holds it, or its rest value when none does. Modifiers
 * (a blink, a breath, a wave) are laid over the spring for one frame at a
 * time, so they never fight a hold and never stick.
 */
export class Rig {
  readonly channels: Channels
  private readonly state = new Map<string, ChannelState>()
  private readonly retiring = new Set<string>()
  /** Set when nothing should move for effect: springs become quick and exact. */
  still = false

  constructor(features: ReadonlyArray<FeatureDef> = []) {
    this.channels = new Channels(features)
    for (const name of this.channels.names()) this.ensure(name)
  }

  private ensure(name: string, start?: number) {
    let state = this.state.get(name)
    if (!state) {
      const spec = this.channels.spec(name)
      if (!spec) return undefined
      state = {
        value: start ?? spec.rest,
        velocity: 0,
        holds: LAYERS.map(() => undefined),
        omega: omegaOf(DEFAULT_OVER),
        zeta: 1,
        add: 0,
        pull: 0,
        pullTo: 0,
      }
      this.state.set(name, state)
    }
    return state
  }

  /** Adds a feature. Its matter flows in: it starts with no share and no light. */
  addFeature(def: FeatureDef): string | undefined {
    const had = this.channels.feature(def.id) !== undefined
    const refusal = this.channels.addFeature(def)
    if (refusal) return refusal
    this.retiring.delete(def.id)
    if (had) return undefined
    for (const name of this.channels.names()) {
      if (!name.startsWith(`${def.id}.`)) continue
      const grows = name.endsWith('.share') || name.endsWith('.alpha')
      this.ensure(name, grows ? 0 : undefined)
    }
    return undefined
  }

  /** Lets a feature's matter flow back out; it is gone once it has none. */
  retireFeature(id: string) {
    if (this.channels.feature(id)) this.retiring.add(id)
  }

  isRetiring(id: string) {
    return this.retiring.has(id)
  }

  /** Has a layer hold a channel at a value. Returns the value held, clamped; `undefined` for no such channel. */
  hold(layer: Layer, name: string, value: number, manner: Manner = {}) {
    const state = this.state.get(name)
    const spec = this.channels.spec(name)
    if (!state || !spec || !Number.isFinite(value)) return undefined
    const held = clamp(value, spec.min, spec.max)
    state.holds[LAYERS.indexOf(layer)] = held
    this.move(state, manner)
    // Matter flows in and out of a feature; everything else may be placed at once.
    const flows = name.endsWith('.share') || name.endsWith('.alpha')
    if (manner.over !== undefined && manner.over < SNAP_MS && !flows) {
      state.value = this.target(name)
      state.velocity = 0
    }
    return held
  }

  /** A layer lets go of some channels, or of all it holds. */
  release(layer: Layer, names?: ReadonlyArray<string>, manner: Manner = {}) {
    const slot = LAYERS.indexOf(layer)
    const each = names ?? [...this.state.keys()]
    for (const name of each) {
      const state = this.state.get(name)
      if (!state || state.holds[slot] === undefined) continue
      state.holds[slot] = undefined
      this.move(state, { over: manner.over ?? 340, bounce: manner.bounce })
    }
  }

  private move(state: ChannelState, manner: Manner) {
    state.omega = omegaOf(manner.over ?? DEFAULT_OVER)
    state.zeta = zetaOf(manner.bounce ?? 0)
  }

  /** The channels a layer holds now. */
  held(layer: Layer): ReadonlyArray<string> {
    const slot = LAYERS.indexOf(layer)
    const names: Array<string> = []
    for (const [name, state] of this.state)
      if (state.holds[slot] !== undefined) names.push(name)
    return names
  }

  /** Where a channel is headed: the top hold, or rest. */
  target(name: string) {
    const state = this.state.get(name)
    const spec = this.channels.spec(name)
    if (!state || !spec) return 0
    const feature = name.slice(0, name.lastIndexOf('.'))
    if (
      this.retiring.has(feature) &&
      (name.endsWith('.share') || name.endsWith('.alpha'))
    )
      return 0
    for (let slot = LAYERS.length - 1; slot >= 0; slot--) {
      const held = state.holds[slot]
      if (held !== undefined) return held
    }
    return spec.rest
  }

  /** Adds to a channel for this frame only. */
  offset(name: string, amount: number) {
    const state = this.state.get(name)
    if (state) state.add += amount
  }

  /** Pulls a channel toward a value for this frame only; 1 puts it there. */
  toward(name: string, to: number, amount: number) {
    const state = this.state.get(name)
    if (!state || amount <= state.pull) return
    state.pull = clamp(amount, 0, 1)
    state.pullTo = to
  }

  /** Clears the frame's modifiers. Call before the things that set them. */
  beginFrame() {
    for (const state of this.state.values()) {
      state.add = 0
      state.pull = 0
    }
  }

  /** Moves every spring on by `dt` seconds. Keep `dt` small and fixed. */
  step(dt: number) {
    for (const [name, state] of this.state) {
      const target = this.target(name)
      if (this.still) {
        // Reduced motion: no overshoot, and quick.
        const rate = 1 - Math.exp(-dt * 14)
        state.value += (target - state.value) * rate
        state.velocity = 0
        continue
      }
      const { omega, zeta } = state
      const force =
        -omega * omega * (state.value - target) -
        2 * zeta * omega * state.velocity
      state.velocity += force * dt
      state.value += state.velocity * dt
    }
    for (const id of this.retiring) {
      const share = this.state.get(`${id}.share`)
      if (share && share.value > 0.02) continue
      this.retiring.delete(id)
      this.channels.removeFeature(id)
      for (const name of [...this.state.keys()])
        if (name.startsWith(`${id}.`)) this.state.delete(name)
    }
  }

  /** Puts every spring at its target at once. */
  settle() {
    for (const [name, state] of this.state) {
      state.value = this.target(name)
      state.velocity = 0
    }
  }

  /** A channel's value now, with this frame's modifiers, inside its bounds. */
  read = (name: string) => {
    const state = this.state.get(name)
    const spec = this.channels.spec(name)
    if (!state || !spec) return 0
    let value = state.value + state.add
    if (state.pull > 0) value += (state.pullTo - value) * state.pull
    return clamp(value, spec.min, spec.max)
  }

  /** Whether any spring is still far from where it is going. */
  moving(epsilon = 0.002) {
    for (const [name, state] of this.state) {
      const spec = this.channels.spec(name)
      if (!spec) continue
      const span = spec.max - spec.min
      if (Math.abs(state.value - this.target(name)) > span * epsilon)
        return true
      if (Math.abs(state.velocity) > span * epsilon * 4) return true
    }
    return false
  }

  /** Every channel that is away from rest, by name, rounded: what the face is doing in numbers. */
  away(): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [name, state] of this.state) {
      const spec = this.channels.spec(name)
      if (!spec) continue
      const span = spec.max - spec.min
      if (Math.abs(state.value - spec.rest) > span * 0.01)
        result[name] = Math.round(state.value * 1000) / 1000
    }
    return result
  }
}
