// SOURCING: lib/face's own parts (rig, matter, player, autonomy, memory, reactions, book) put together behind one object with a fixed-step clock, the way lib/kit/driver.ts owns Kit's motion; liveness is lib/kit/liveness's reading of the runs, shared rather than derived twice. Which performance each liveness settles into, when the face sleeps, and what the figure's motion on the page does to the face inside it (lib/face/body moves the figure; the lean, the trailing visor and the flinch here are this app's) are this app's.
import type { KitExpression, Liveness } from '@/lib/kit/liveness'
import { Autonomy } from './autonomy'
import { Book } from './book'
import type { Shelf } from './book'
import { FACE_CHANNELS, FEATURE_PARAMS, clamp } from './channels'
import { readShape, sideOf } from './feature'
import { FEEL } from './feel'
import type { Shape } from './feature'
import { THEO } from './identity'
import type { Identity } from './identity'
import { Rig } from './layers'
import type { Layer } from './layers'
import { Memory, matches } from './memory'
import type { FaceEvent } from './memory'
import { Field, GRAIN_STRIDE, oklch, shapesFor } from './particles'
import type { Matter } from './particles'
import { Player } from './player'
import type { Ending, Invocation, Stage } from './player'
import { LIMITS, STEP_MANUAL, THING_MANUAL, compile, isThing } from './program'
import type { Place, Program } from './program'
import { Reactions } from './reactions'
import { seeded } from './random'
import { SIGNALS, Signals } from './signals'

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
/** With motion reduced, what leaves the face's sides does not follow the sound: it is this much while a signal it is tied to is over this, and nothing otherwise. */
const STEADY = { over: 0.05, amount: 0.6 }
const STEP = 1 / 120
/** What the figure's motion on the page does to the face. Speeds are face units per second. */
const SWAY = {
  /** Motion faster than this reads as this. */
  fastest: 2400,
  /** How quickly the face takes up a change of motion, and how slowly the visor catches up with it, per second. */
  quick: 14,
  slow: 5,
  /** Degrees of lean per unit of sideways speed, before the person's setting. */
  lean: 0.011,
  /** Gaze per unit of speed. */
  ahead: 0.0004,
  /** Face units of trailing per unit of change in speed, before the person's setting. */
  trail: 0.006,
} as const
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
  /** The hue of the matter, in OKLCH degrees: the identity's own until the page gives its theme's (lib/face/tint). `matter.hue` turns from here. */
  hue: number
  readonly rig: Rig
  readonly field: Field
  readonly book: Book
  readonly memory: Memory
  readonly reactions: Reactions
  readonly player: Player
  readonly buffer: Float32Array
  /** What the page measures as it happens, for programs that follow it. */
  readonly signals = new Signals()
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
  /** Where the figure is about to go, as a gaze: the eyes get there first. */
  private bound = { x: 0, y: 0, weight: 0, target: 0 }
  /** Something on the page that moved and has its eye: Kit in the air. */
  private seen = { x: 0, y: 0, weight: 0, target: 0 }
  /** How the figure is moving on the page, in face units per second: as told this frame, smoothed, and smoothed slowly. */
  private readonly motion = {
    x: 0,
    y: 0,
    fresh: false,
    vx: 0,
    vy: 0,
    slowX: 0,
    slowY: 0,
  }
  /** A knock that is dying away: which way it threw the head, and which eye it closed on. */
  private readonly knock = { x: 0, y: 0, squash: 0, eye: 0, amount: 0 }
  private seeds: number
  /** The event that ends the form the face has taken, while it has one. */
  private formUntil: string | undefined
  asleep = false

  constructor(options: FaceOptions = {}) {
    this.identity = options.identity ?? THEO
    this.hue = this.identity.hue
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
      this.signals.read,
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
      /** A thing the program names that is not on the page refuses it. */
      strict?: boolean
      /** What it sets stays when it ends, whether or not the program says so. */
      keep?: boolean
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
      ...(this.stage.thing ? { thing: this.stage.thing } : {}),
      ...(how.strict ? { strict: true } : {}),
    })
    if (!checked.ok) return checked
    const layer = how.layer ?? 'performance'
    if (layer !== 'mood') this.rouse()
    const score = how.keep ? { ...checked.score, keep: true } : checked.score
    const invocation = this.player.play(score, {
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

  /**
   * What the page measured this frame, by signal name: how loud the sound it
   * is playing is, and the like. Programs that follow a signal move with it.
   */
  feed(measured: Readonly<Record<string, number>>) {
    this.signals.feed(measured)
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
    // What a form was waiting for has come.
    if (this.formUntil !== undefined && matches(this.formUntil, kind))
      this.unform()
    // Something that will last has begun: the face takes a form for it, beneath whatever else it does, asleep or not.
    const lasting = this.reactions.form(
      event,
      reading,
      this.memory.mood,
      this.memory,
    )
    let formed: Invocation | undefined
    if (lasting) {
      const performed = this.perform(lasting.name ?? lasting.program, {
        layer: 'form',
        owner: `rule:${lasting.rule.id}`,
        intensity: lasting.intensity,
        keep: true,
      })
      if (performed.ok) {
        formed = performed.invocation
        this.formUntil = lasting.rule.until
      }
    }
    if (formed) return formed
    if (this.asleep) {
      // Only the person or a run wakes it; the window resizing does not, nor its own body settling.
      if (kind.startsWith('env.') || kind.startsWith('body.')) return undefined
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

  /** Lets go of the form the face has taken, if it has one: what it was a form for is over. */
  unform() {
    this.formUntil = undefined
    if (!this.player.holding('form')) return
    this.player.stop('form')
    this.idleSince = this.clock()
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
    // Working has begun, or begun again after a question, or is over whatever came next: what lasts for as long
    // as the work does starts and ends here. Said last, so the events a rule waits for in order stay next to each other.
    if (liveness === 'work') this.notice('run.work')
    if (before === 'work') this.notice('run.rest')
  }

  /** Whether a run is at work now. */
  get working() {
    return this.liveness === 'work'
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
      hold('matter.hue', ((expression.hue - this.hue + 540) % 360) - 180)
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

  /**
   * Something on the page is moving and worth a look: Kit, jumping. The eyes
   * go with it, over the pointer but not over where the figure itself is
   * bound. A gaze, -1..1; `undefined` when it has stopped.
   */
  watch(gaze: { x: number; y: number } | undefined) {
    if (!gaze) {
      this.seen.target = 0
      return
    }
    this.seen.x = clamp(gaze.x, -1, 1)
    this.seen.y = clamp(gaze.y, -1, 1)
    this.seen.target = 1
  }

  /** A tap at a point of the face, in face units: the eye on that side flinches, whatever else the face makes of it. */
  poke(x = 0, y = 0) {
    this.field.burst(x, y, 70)
    this.flinch(Math.abs(x) < 4 ? 0 : Math.sign(x), 0.7)
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

  /** Let go while moving: thrown. `force` is 0 for barely to 1 for as hard as a throw gets. */
  toss(force = 0.5) {
    this.rig.release('hand', undefined, { over: 420, bounce: 0.5 })
    return this.notice('person.throw', 0.6 + 0.8 * clamp(force, 0, 1))
  }

  // The body ----------------------------------------------------------------
  // The figure's place on the page is a physical body's (lib/face/body). What
  // its motion does to the face is said here. None of it is evidence of a
  // run: liveness comes from the runs alone (setLiveness).

  /**
   * The figure moved this far on the page over `seconds`, in face units:
   * the matter lags, the head leans into the motion, the visor trails a
   * change of pace and the eyes look a little where it is going.
   */
  sway(dx: number, dy: number, seconds: number) {
    if (this.rig.still || !(seconds > 0)) return
    this.field.shove(clamp(dx, -6, 6) * 0.35, clamp(dy, -6, 6) * 0.35)
    this.motion.x = clamp(dx / seconds, -SWAY.fastest, SWAY.fastest)
    this.motion.y = clamp(dy / seconds, -SWAY.fastest, SWAY.fastest)
    this.motion.fresh = true
  }

  /** The figure is about to go somewhere: the eyes turn that way first. A gaze, -1..1; `undefined` when it has arrived. */
  heading(gaze: { x: number; y: number } | undefined) {
    if (!gaze) {
      this.bound.target = 0
      return
    }
    this.bound.x = clamp(gaze.x, -1, 1)
    this.bound.y = clamp(gaze.y, -1, 1)
    this.bound.target = 1
  }

  /**
   * The figure struck something on this side of it: an edge of the page, or
   * Kit when `against` says so. `force` is 0 for a touch to 1 for as hard as
   * it can be thrown. The head is knocked back from what it met and the eye
   * on that side shuts for a moment; what else the face makes of it is the
   * rules', and they tell an edge (`body.bump.<side>`) from Kit
   * (`body.meet.kit`).
   */
  bump(
    side: 'left' | 'right' | 'top' | 'bottom',
    force = 0.5,
    against?: 'kit',
  ) {
    const hard = clamp(force, 0, 1)
    const { width, height } = this.identity
    const across = side === 'left' ? -1 : side === 'right' ? 1 : 0
    const down = side === 'top' ? -1 : side === 'bottom' ? 1 : 0
    this.field.burst(
      (across * width) / 2,
      (down * height) / 2,
      50 + 110 * hard,
      26,
    )
    if (!this.rig.still) {
      this.knock.x = -across * (2 + 5 * hard)
      this.knock.y = -down * (2 + 4 * hard)
      // Flattened against the edge it met.
      this.knock.squash = (across === 0 ? 1 : -1) * (0.05 + 0.11 * hard)
      this.flinch(across, 0.5 + 0.5 * hard)
    }
    return this.notice(
      against ? `body.meet.${against}` : `body.bump.${side}`,
      0.6 + 0.8 * hard,
    )
  }

  /** One eye shuts for a moment, or both a little when it came from neither side. */
  private flinch(eye: number, amount: number) {
    if (this.rig.still) return
    this.knock.eye = eye
    this.knock.amount = Math.max(this.knock.amount, clamp(amount, 0, 1))
  }

  /** Lays this frame's share of the figure's motion over the rig. */
  private carryMotion(dt: number) {
    const { rig, motion, knock, bound } = this
    const quick = 1 - Math.exp(-dt * SWAY.quick)
    motion.vx += ((motion.fresh ? motion.x : 0) - motion.vx) * quick
    motion.vy += ((motion.fresh ? motion.y : 0) - motion.vy) * quick
    this.signals.feed({
      'body.speed': Math.hypot(motion.vx, motion.vy) / SWAY.fastest,
    })
    const slow = 1 - Math.exp(-dt * SWAY.slow)
    motion.slowX += (motion.vx - motion.slowX) * slow
    motion.slowY += (motion.vy - motion.slowY) * slow
    bound.weight += (bound.target - bound.weight) * (1 - Math.exp(-dt * 10))
    const fade = Math.exp(-dt * FEEL.recover)
    knock.x *= fade
    knock.y *= fade
    knock.squash *= fade
    knock.amount *= fade
    if (rig.still) return
    if (Math.abs(motion.vx) + Math.abs(motion.vy) > 0.5) {
      rig.offset('face.tilt', clamp(motion.vx * SWAY.lean * FEEL.lean, -16, 16))
      rig.offset('gaze.x', clamp(motion.vx * SWAY.ahead * FEEL.lean, -0.3, 0.3))
      rig.offset('gaze.y', clamp(motion.vy * SWAY.ahead * FEEL.lean, -0.3, 0.3))
    }
    // Speeding up, the visor is left a little behind; slowing, it runs a little on.
    const lagX = clamp(
      (motion.slowX - motion.vx) * SWAY.trail * FEEL.trail,
      -5,
      5,
    )
    const lagY = clamp(
      (motion.slowY - motion.vy) * SWAY.trail * FEEL.trail,
      -5,
      5,
    )
    if (
      Math.abs(lagX) + Math.abs(lagY) + Math.abs(knock.x) + Math.abs(knock.y) >
      0.02
    ) {
      rig.offset('face.dx', lagX + knock.x)
      rig.offset('face.dy', lagY + knock.y)
    }
    if (Math.abs(knock.squash) > 0.002) rig.offset('face.squash', knock.squash)
    if (knock.amount > 0.01) {
      for (const feature of rig.channels.features()) {
        if (!feature.id.startsWith('eye')) continue
        const side =
          feature.side === 'left' ? -1 : feature.side === 'right' ? 1 : 0
        // The eye it came at shuts most; the other barely.
        const share = knock.eye === 0 ? 0.45 : side === knock.eye ? 1 : 0.15
        rig.offset(`${feature.id}.lid`, 0.7 * knock.amount * share)
        rig.offset(`${feature.id}.low`, 0.25 * knock.amount * share)
      }
    }
    if (bound.weight > 0.01 && !this.asleep) {
      rig.offset('gaze.x', bound.x * 0.8 * bound.weight)
      rig.offset('gaze.y', bound.y * 0.8 * bound.weight)
    }
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
    // Motion is told afresh each frame; untold, the figure is not moving.
    this.motion.fresh = false
    this.paint()
  }

  /** Gives the matter the hue of the page's theme, and shows it at once, on a face that is not advancing as much as on one that is. */
  tint(hue: number) {
    this.hue = hue
    this.paint()
  }

  /** Writes the grains as they stand into the buffer, in the hue the face has now. */
  private paint() {
    const colour = oklch(
      this.identity.lightness,
      this.identity.chroma,
      this.hue + this.matter.hue,
    )
    this.field.write(this.buffer, this.matter, this.identity.grain, colour)
  }

  private tick(dt: number) {
    const now = this.clock()
    if (
      !this.asleep &&
      this.liveness === 'idle' &&
      now - this.idleSince > SLEEP_AFTER_MS &&
      !this.player.active('performance') &&
      !this.player.holding('form')
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
    this.seen.weight +=
      (this.seen.target - this.seen.weight) * (1 - Math.exp(-dt * 9))
    // Bound for somewhere, the eyes are on where it is going; watching Kit, on Kit; only otherwise on the pointer.
    const watching = this.seen.weight * (1 - this.bound.weight)
    if (watching > 0.01 && !this.asleep) {
      rig.offset('gaze.x', this.seen.x * 0.8 * watching)
      rig.offset('gaze.y', this.seen.y * 0.8 * watching)
    }
    const free =
      this.follow.weight * (1 - this.bound.weight) * (1 - this.seen.weight)
    if (free > 0.01 && !this.asleep) {
      rig.offset('gaze.x', this.follow.x * 0.7 * free)
      rig.offset('gaze.y', this.follow.y * 0.7 * free)
    }
    this.carryMotion(dt)
    rig.step(dt)
    this.pose()
    this.field.step(this.shapes, this.matter, dt, this.time)
  }

  /** The mood shows faintly all the time: a pleased face smiles a little, a wound-up one trembles. */
  private colourByMood(now: number) {
    if (this.rig.still || this.asleep) return
    const mood = this.memory.settle(now)
    // In a form the eyes are something else: a smile on a loudspeaker is a dent in it.
    const formed = this.player.holding('form') !== undefined
    const pleased = Math.max(0, mood.valence - 0.2)
    const sour = Math.max(0, -mood.valence)
    for (const feature of this.rig.channels.features()) {
      if (formed || !feature.id.startsWith('eye')) continue
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
      // With motion reduced a globe is a ball of dots that does not turn.
      if (rig.still) shape.spin = shape.stir = 0
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

  /** How much leaves each side of the face, 0 to 1, for whoever draws it: it is outside the visor, so it is no matter of the face's. */
  emitting(): { left: number; right: number } {
    if (this.rig.still) {
      // With motion reduced nothing follows the sound. That something is sounding is still shown: steadily, there or not.
      const steady = (channel: string) =>
        this.player
          .tied(channel)
          .some((signal) => this.signals.read(signal) > STEADY.over)
          ? STEADY.amount
          : 0
      return { left: steady('emit.left'), right: steady('emit.right') }
    }
    return {
      left: this.rig.read('emit.left'),
      right: this.rig.read('emit.right'),
    }
  }

  /** What the face is doing, in a few words, for a status a screen reader gets. */
  words() {
    if (this.asleep) return 'asleep'
    const active =
      this.player.active('hand') ??
      this.player.active('performance') ??
      this.player.active('reaction') ??
      this.player.holding('form')
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
    const pointing = this.stage.pointing?.()
    const form = this.player.holding('form')
    const signals = this.signals.away()
    return {
      liveness: this.liveness,
      asleep: this.asleep,
      doing: this.words(),
      ...(pointing ? { pointing } : {}),
      ...(form?.name && this.formUntil
        ? { form: { name: form.name, until: this.formUntil } }
        : {}),
      ...(Object.keys(signals).length > 0 ? { signals } : {}),
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

  manual(part: 'all' | 'channels' | 'book' | 'page' | 'state' = 'all') {
    const state = this.state()
    if (part === 'state') return state
    // What the page has named, read fresh: it changes as the conversation does.
    const page = {
      how: THING_MANUAL,
      things: this.stage.things?.() ?? [],
    }
    if (part === 'page') return { page, state }
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
      signals: {
        how: 'Numbers the page measures as it happens. A follow step ties a channel to one; you cannot set them.',
        ...Object.fromEntries(
          Object.entries(SIGNALS).map(([name, spec]) => [
            name,
            `${spec.min}..${spec.max}. ${spec.note}`,
          ]),
        ),
      },
      layers:
        'Lowest to highest: mood, form, reaction, performance, hand. Your programs play on performance; the person’s hand overrides them while it holds the face.',
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
        ...(item.until ? { until: item.until } : {}),
        ...(item.by && item.by !== 'theo' ? { by: item.by } : {}),
      })),
    }
    if (part === 'book') return { book, state }
    return {
      about:
        'Theo is a face made of glowing matter: two eyes at rest, and anything else you add as a feature. A performance is a program of steps over time. Nothing limits you to the named performances: write new programs, add features, save what works.',
      channels,
      steps: STEP_MANUAL,
      page,
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
  if (isThing(place)) return undefined
  if (typeof place === 'object') return place
  if (place === 'centre' || place === 'person') return { x: 0, y: 0 }
  if (place === 'composer') return { x: 0.15, y: 0.75 }
  if (place === 'text') return { x: 0.7, y: 0.1 }
  if (place === 'artifact') return { x: 0.6, y: -0.3 }
  return undefined
}

export type { Program }
