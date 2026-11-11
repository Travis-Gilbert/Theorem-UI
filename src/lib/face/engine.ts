// SOURCING: lib/face's own parts (rig, matter, player, autonomy, memory, reactions, book) put together behind one object with a fixed-step clock, the way lib/kit/driver.ts owns Kit's motion; liveness is lib/kit/liveness's reading of the runs, shared rather than derived twice. Which performance each liveness settles into, and when the face sleeps, are this app's.
import type { KitExpression, Liveness } from '@/lib/kit/liveness'
import { Autonomy } from './autonomy'
import { Book } from './book'
import type { Shelf } from './book'
import { FACE_CHANNELS, FEATURE_PARAMS, clamp } from './channels'
import { readShape, sideOf } from './feature'
import type { Shape } from './feature'
import { THEO } from './identity'
import type { Identity } from './identity'
import { Rig } from './layers'
import type { Layer } from './layers'
import { Memory } from './memory'
import type { FaceEvent } from './memory'
import { Field, GRAIN_STRIDE, oklch, shapesFor } from './particles'
import type { Matter } from './particles'
import { Player } from './player'
import type { Ending, Invocation, Stage } from './player'
import { LIMITS, STEP_MANUAL, compile } from './program'
import type { Place, Program } from './program'
import { Reactions } from './reactions'
import { seeded } from './random'

/** How the head sits, for whatever draws the visor. */
export interface Head {
  tilt: number
  scale: number
  dx: number
  dy: number
  squash: number
}

export interface FaceOptions {
  readonly identity?: Identity
  readonly seed?: number
  /** Where definitions and the days baseline are kept. */
  readonly shelf?: Shelf
  readonly clock?: () => number
}

/** What a request to perform came to. */
export type Performed =
  | {
      readonly ok: true
      readonly invocation: Invocation
      readonly notes: ReadonlyArray<string>
    }
  | { readonly ok: false; readonly path: string; readonly reason: string }

/** The liveness each mood performance is for. Idle and done settle into none. */
const MOODS: Partial<Record<Liveness, string>> = {
  attend: 'attend',
  work: 'focus',
  ask: 'ask',
}

/** Idle this long, the face sleeps. */
export const SLEEP_AFTER_MS = 90_000
const STEP = 1 / 120
const noStage: Stage = {
  gazeAt: () => undefined,
  go: () => {},
  burst: () => {},
}

/**
 * Theo: one face. Everything that moves it goes through here, whoever asks:
 * the run's liveness, the agent's operations, the reaction rules, the
 * person's hand. It draws nothing; `frame` fills a buffer of grains that a
 * renderer draws, and `head` says how the visor sits.
 */
export class Face {
  readonly identity: Identity
  readonly rig: Rig
  readonly field: Field
  readonly book: Book
  readonly memory: Memory
  readonly reactions: Reactions
  readonly player: Player
  readonly buffer: Float32Array
  private readonly autonomy: Autonomy
  private readonly clock: () => number
  private readonly shapes: Array<Shape> = []
  private readonly matter: Matter = {
    cohesion: 0,
    jitter: 0,
    drift: 0,
    size: 1,
    glow: 1,
    hue: 0,
  }
  private stage: Stage = noStage
  private time = 0
  private last: number | undefined
  private liveness: Liveness = 'idle'
  private idleSince: number
  private expressed: Array<string> = []
  private follow = { x: 0, y: 0, weight: 0, target: 0 }
  private seeds: number
  asleep = false

  constructor(options: FaceOptions = {}) {
    this.identity = options.identity ?? THEO
    this.clock = options.clock ?? (() => Date.now())
    const seed = options.seed ?? 20261111
    this.seeds = seed
    this.rig = new Rig(this.identity.features)
    this.field = new Field(this.identity, seed)
    this.book = new Book(options.shelf)
    this.memory = new Memory(options.shelf)
    this.reactions = new Reactions(
      this.book,
      seeded(seed ^ 0x9e3779b9),
      options.shelf,
    )
    this.autonomy = new Autonomy(seeded(seed ^ 0x85ebca6b))
    this.player = new Player(
      this.rig,
      {
        gazeAt: (place) => this.stage.gazeAt(place),
        go: (place, size, over) => this.stage.go(place, size, over),
        burst: (x, y, strength) => this.field.burst(x, y, strength),
      },
      this.clock,
    )
    this.buffer = new Float32Array(this.field.count * GRAIN_STRIDE)
    this.idleSince = this.clock()
    this.advance(0)
  }

  /** Says where the face is shown, so it can look at things and move. */
  attach(stage: Stage | undefined) {
    this.stage = stage ?? noStage
  }

  /** No motion for effect: the face still changes, without flourish. */
  set still(value: boolean) {
    this.rig.still = value
  }

  get still() {
    return this.rig.still
  }

  // Performing ------------------------------------------------------------

  /**
   * Checks a program and, if it is sound, plays it on a layer. The program
   * may be a book name, a program, a list of steps or one step.
   */
  perform(
    input: unknown,
    how: {
      layer?: Layer
      owner: string
      args?: Record<string, number>
      intensity?: number
      seed?: number
    },
  ): Performed {
    let name: string | undefined
    let program: unknown = input
    if (typeof input === 'string') {
      const entry = this.book.get(input)
      if (!entry)
        return {
          ok: false,
          path: 'use',
          reason: `The book has no performance "${input}".`,
        }
      name = `${entry.name}@${entry.version}`
      program = entry.program
    }
    const checked = compile(program, {
      channels: this.rig.channels,
      lookup: this.book.lookup,
      seed: how.seed ?? this.nextSeed(),
      ...(how.args ? { args: how.args } : {}),
      ...(how.intensity === undefined ? {} : { intensity: how.intensity }),
    })
    if (!checked.ok) return checked
    const layer = how.layer ?? 'performance'
    if (layer !== 'mood') this.rouse()
    const invocation = this.player.play(checked.score, {
      layer,
      owner: how.owner,
      ...(name ? { name } : {}),
    })
    return { ok: true, invocation, notes: checked.score.notes }
  }

  /** Resolves when an invocation ends. */
  ended(id: string): Promise<Ending> {
    return this.player.ended(id)
  }

  private nextSeed() {
    this.seeds = (Math.imul(this.seeds, 1664525) + 1013904223) >>> 0
    return this.seeds
  }

  // Events ----------------------------------------------------------------

  /**
   * Something happened. The face remembers it and may react; what it does
   * depends on what else has happened, so the same event twice is not
   * promised the same face.
   */
  notice(kind: string, weight = 1): Invocation | undefined {
    const event: FaceEvent = { kind, at: this.clock(), weight }
    const reading = this.memory.note(event)
    if (kind.startsWith('person.')) this.idleSince = event.at
    if (this.asleep) {
      // Only the person or a run wakes it; the window resizing does not.
      if (kind.startsWith('env.')) return undefined
      this.rouse()
      return undefined
    }
    // A deliberate performance is not talked over.
    if (this.player.active('performance') || this.player.active('hand'))
      return undefined
    const reaction = this.reactions.react(
      event,
      reading,
      this.memory.mood,
      this.memory,
    )
    if (!reaction) return undefined
    const performed = this.perform(reaction.name ?? reaction.program, {
      layer: 'reaction',
      owner: `rule:${reaction.rule.id}`,
      intensity: reaction.intensity,
    })
    return performed.ok ? performed.invocation : undefined
  }

  /** Follows the run: each liveness settles the face into its own manner. */
  setLiveness(liveness: Liveness) {
    if (liveness === this.liveness) return
    const before = this.liveness
    this.liveness = liveness
    if (liveness !== 'idle') this.rouse()
    else this.idleSince = this.clock()
    const mood = MOODS[liveness]
    if (mood) this.perform(mood, { layer: 'mood', owner: 'liveness' })
    else if (!this.asleep) this.player.stop('mood')
    if (liveness === 'work' && before !== 'ask') this.notice('run.start')
    if (liveness === 'ask') this.notice('run.ask')
    if (liveness === 'done') this.notice('run.done')
  }

  /** The manner the agent authored for its turn, laid on the mood layer. */
  express(expression: KitExpression | undefined) {
    this.rig.release('mood', this.expressed)
    this.expressed = []
    if (!expression) return
    const hold = (channel: string, value: number) => {
      if (this.rig.hold('mood', channel, value, { over: 500 }) !== undefined)
        this.expressed.push(channel)
    }
    if (expression.tilt !== undefined) hold('face.tilt', expression.tilt * 14)
    if (expression.gaze) {
      hold('gaze.x', expression.gaze[0])
      hold('gaze.y', expression.gaze[1])
    }
    if (expression.energy !== undefined) {
      hold('matter.jitter', 0.03 + 0.22 * clamp(expression.energy, 0, 1))
      hold('auto.saccade', 0.5 + 1.6 * clamp(expression.energy, 0, 1))
    }
    if (expression.breath !== undefined) hold('auto.breath', expression.breath)
    if (expression.hue !== undefined)
      hold(
        'matter.hue',
        ((expression.hue - this.identity.hue + 540) % 360) - 180,
      )
  }

  /** Wakes the face if it sleeps. */
  rouse() {
    this.idleSince = this.clock()
    if (!this.asleep) return
    this.asleep = false
    this.player.stop('mood')
    const mood = MOODS[this.liveness]
    if (mood) this.perform(mood, { layer: 'mood', owner: 'liveness' })
    this.perform('wake', { layer: 'reaction', owner: 'liveness' })
  }

  // The person's hand ------------------------------------------------------

  /** The pointer is near: the eyes follow it. Coordinates are a gaze, -1..1; `undefined` lets go. */
  followPointer(gaze: { x: number; y: number } | undefined) {
    if (!gaze) {
      this.follow.target = 0
      return
    }
    this.follow.x = clamp(gaze.x, -1, 1)
    this.follow.y = clamp(gaze.y, -1, 1)
    this.follow.target = 1
  }

  /** A tap at a point of the face, in face units. */
  poke(x = 0, y = 0) {
    this.field.burst(x, y, 70)
    return this.notice('person.poke')
  }

  /** Picked up: the eyes go wide while it is carried. */
  grab() {
    this.rouse()
    this.player.stop('hand')
    for (const [channel, value] of [
      ['eyes.h', 15.5],
      ['eyes.round', 2.8],
      ['face.squash', -0.06],
      ['auto.blink', 0],
    ] as const)
      for (const name of this.rig.channels.expand(channel))
        this.rig.hold('hand', name, value, { over: 140, bounce: 0.4 })
  }

  /** Carried by this much, in face units per frame: it leans into the motion and its matter lags. */
  carry(dx: number, dy: number) {
    this.field.shove(dx * 0.6, dy * 0.6)
    this.rig.hold('hand', 'face.tilt', clamp(dx * 2.2, -24, 24), { over: 120 })
  }

  /** Put down. */
  drop() {
    this.rig.release('hand', undefined, { over: 420, bounce: 0.5 })
    return this.notice('person.drop')
  }

  // Frames ----------------------------------------------------------------

  /** Advances to `now` (milliseconds) and fills the buffer. Returns it. */
  frame(now: number) {
    const elapsed =
      this.last === undefined ? 0 : Math.min(100, Math.max(0, now - this.last))
    this.last = now
    this.advance(elapsed / 1000)
    return this.buffer
  }

  /** Advances by a span of seconds in fixed steps, whatever the frame rate. */
  advance(seconds: number) {
    const steps = Math.max(1, Math.ceil(seconds / STEP - 1e-6))
    const dt = seconds / steps
    for (let step = 0; step < steps; step++) this.tick(dt)
    const colour = oklch(
      this.identity.lightness,
      this.identity.chroma,
      this.identity.hue + this.matter.hue,
    )
    this.field.write(this.buffer, this.matter, this.identity.grain, colour)
  }

  private tick(dt: number) {
    const now = this.clock()
    if (
      !this.asleep &&
      this.liveness === 'idle' &&
      now - this.idleSince > SLEEP_AFTER_MS &&
      !this.player.active('performance')
    ) {
      this.asleep = true
      this.perform('sleep', { layer: 'mood', owner: 'liveness' })
    }
    this.time += dt
    const { rig } = this
    rig.beginFrame()
    this.player.tick(dt * 1000)
    this.autonomy.tick(rig, dt)
    this.colourByMood(now)
    this.follow.weight +=
      (this.follow.target - this.follow.weight) * (1 - Math.exp(-dt * 7))
    if (this.follow.weight > 0.01 && !this.asleep) {
      rig.offset('gaze.x', this.follow.x * 0.7 * this.follow.weight)
      rig.offset('gaze.y', this.follow.y * 0.7 * this.follow.weight)
    }
    rig.step(dt)
    this.pose()
    this.field.step(this.shapes, this.matter, dt, this.time)
  }

  /** The mood shows faintly all the time: a pleased face smiles a little, a wound-up one trembles. */
  private colourByMood(now: number) {
    if (this.rig.still || this.asleep) return
    const mood = this.memory.settle(now)
    const pleased = Math.max(0, mood.valence - 0.2)
    const sour = Math.max(0, -mood.valence)
    for (const feature of this.rig.channels.features()) {
      if (!feature.id.startsWith('eye')) continue
      this.rig.offset(`${feature.id}.lowBow`, pleased * 0.35)
      this.rig.offset(`${feature.id}.lidTilt`, sour * 0.35)
    }
    this.rig.offset('matter.jitter', Math.max(0, mood.arousal - 0.3) * 0.12)
    this.rig.offset('auto.blink', (mood.arousal - 0.25) * 0.8)
  }

  /** Reads the rig into shapes and matter, with the gaze turned into where the features sit. */
  private pose() {
    const { rig } = this
    const features = rig.channels.features()
    shapesFor(this.shapes, features.length)
    const gazeX = rig.read('gaze.x')
    const gazeY = rig.read('gaze.y')
    features.forEach((feature, index) => {
      const shape = readShape(this.shapes[index] as Shape, feature.id, rig.read)
      shape.side = sideOf(feature)
      const depth = feature.id.startsWith('eye') ? 1 : 0.7
      const side = shape.side === 0 ? 1 : shape.side
      // Looking sideways slides the features across and narrows the far one a little.
      shape.x += side * gazeX * 8 * depth
      shape.y += gazeY * 6 * depth
      if (shape.side !== 0) shape.w *= 1 - 0.1 * gazeX * shape.side
      shape.h *= 1 - 0.06 * Math.abs(gazeY)
    })
    const { matter } = this
    matter.cohesion = rig.read('matter.cohesion')
    matter.jitter = rig.still ? 0 : rig.read('matter.jitter')
    matter.drift = rig.still ? 0 : rig.read('matter.drift')
    matter.size = rig.read('matter.size')
    matter.glow = rig.read('matter.glow')
    matter.hue = rig.read('matter.hue')
  }

  /** The feature shapes as they are now, for the still mark and for tests. */
  shapesNow(): ReadonlyArray<Shape> {
    return this.shapes
  }

  head(): Head {
    const { rig } = this
    return {
      tilt: rig.read('face.tilt'),
      scale: rig.read('face.scale'),
      dx: rig.read('face.dx'),
      dy: rig.read('face.dy'),
      squash: rig.read('face.squash'),
    }
  }

  /** What the face is doing, in a few words, for a status a screen reader gets. */
  words() {
    if (this.asleep) return 'asleep'
    const active =
      this.player.active('hand') ??
      this.player.active('performance') ??
      this.player.active('reaction')
    const name = active?.name?.split('@')[0]
    if (name) return name
    return this.liveness === 'idle'
      ? 'at rest'
      : (MOODS[this.liveness] ?? this.liveness)
  }

  // The manual --------------------------------------------------------------

  /**
   * Everything a model needs to drive the face, as data: the channels with
   * their bounds, the features, the steps a program is made of, what is in
   * the book, the rules, and what the face is doing now.
   */
  /** What the face is doing and has lately done: the part of the manual that changes. */
  state() {
    return {
      liveness: this.liveness,
      asleep: this.asleep,
      doing: this.words(),
      features: this.rig.channels
        .features()
        .map((feature) => ({ id: feature.id, side: feature.side })),
      away: this.rig.away(),
      mood: {
        arousal: round(this.memory.mood.arousal),
        valence: round(this.memory.mood.valence),
        focus: round(this.memory.mood.focus),
      },
      recentEvents: this.memory.recent.slice(-8).map((event) => event.kind),
      performances: this.player.history.slice(-6).map((invocation) => ({
        id: invocation.id,
        ...(invocation.name ? { name: invocation.name } : {}),
        owner: invocation.owner,
        layer: invocation.layer,
        ms: Math.round(invocation.ms),
        ending: invocation.ending ?? 'running',
      })),
    }
  }

  manual(part: 'all' | 'channels' | 'book' | 'state' = 'all') {
    const state = this.state()
    if (part === 'state') return state
    const bounds = (
      specs: Record<
        string,
        { min: number; max: number; rest: number; note: string }
      >,
    ) =>
      Object.fromEntries(
        Object.entries(specs).map(([name, spec]) => [
          name,
          `${spec.min}..${spec.max}, rest ${spec.rest}. ${spec.note}`,
        ]),
      )
    const channels = {
      units: `The visor is ${this.identity.width} wide and ${this.identity.height} tall in face units, centre 0,0, y down.`,
      feature:
        'Every feature has these params; its channels are "<feature id>.<param>", e.g. "eye.left.lid". "eyes.<param>" means both eyes.',
      featureParams: bounds(FEATURE_PARAMS),
      face: bounds(FACE_CHANNELS),
      layers:
        'Lowest to highest: mood, reaction, performance, hand. Your programs play on performance; the person’s hand overrides them while it holds the face.',
    }
    if (part === 'channels') return { channels, state }
    const book = {
      performances: this.book.list().map((entry) => ({
        name: `${entry.name}@${entry.version}`,
        by: entry.by,
        note: entry.note,
      })),
      rules: this.reactions.rules().map((item) => ({
        id: item.id,
        on: item.on,
        do: typeof item.do === 'string' ? item.do : '(program)',
        ...(item.when ? { when: item.when } : {}),
        ...(item.by && item.by !== 'theo' ? { by: item.by } : {}),
      })),
    }
    if (part === 'book') return { book, state }
    return {
      about:
        'Theo is a face made of glowing matter: two eyes at rest, and anything else you add as a feature. A performance is a program of steps over time. Nothing limits you to the named performances: write new programs, add features, save what works.',
      channels,
      steps: STEP_MANUAL,
      values:
        'A value is a number, {rand:[low,high]} for a fresh draw each play, or {arg:"name", or:number}.',
      limits: `A performance runs at most ${LIMITS.ms} ms and ${LIMITS.cues} cues. Values outside bounds are pulled in and reported as notes.`,
      book,
      state,
    }
  }
}

const round = (value: number) => Math.round(value * 100) / 100

/** A place as a gaze when nothing on the page can say better. */
export function plainGaze(place: Place): { x: number; y: number } | undefined {
  if (typeof place === 'object') return place
  if (place === 'centre' || place === 'person') return { x: 0, y: 0 }
  if (place === 'composer') return { x: 0.15, y: 0.75 }
  if (place === 'text') return { x: 0.7, y: 0.1 }
  return undefined
}

export type { Program }
