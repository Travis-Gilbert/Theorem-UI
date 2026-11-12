// SOURCING: the composition operators of animation timelines (sequence, parallel, stagger, repeat, as in anime.js timelines and the handoff's "performance over time", docs/plans/theo-face.md) written as plain JSON so a model, a rule or a person can author one; the checker answers with a path and a reason, as lib/blocks/app-inspect answers with file and line. The step vocabulary is this app's.
import { Channels, FEATURE_ID, clamp } from './channels'
import type { FeatureSide } from './channels'
import { between, seeded, weighted } from './random'
import { SIGNAL_NAMES, isSignal } from './signals'
import type { Random } from './random'

/** A number, a draw between two bounds, or an argument the caller passes. */
export type Value =
  | number
  | { readonly rand: readonly [number, number] }
  | { readonly arg: string; readonly or?: number }

/**
 * Something particular on the page, by the name the page gives it
 * (`face.read` lists them), and optionally one part of it.
 */
export interface Thing {
  /** `kind:id`, or `kind:last` and `kind:failed` for the newest of a kind. */
  readonly thing: string
  /** The first place these words appear in it. */
  readonly text?: string
  /** A numbered line of it, where it has numbered lines. */
  readonly line?: number
}

/** A point: of the gaze for `look`, of the window for `go`. */
export interface Spot {
  readonly x: number
  readonly y: number
}

/** Where the face can be told to look or go. */
export type Place =
  | 'person'
  | 'pointer'
  | 'centre'
  | 'composer'
  | 'text'
  | 'home'
  | 'artifact'
  | Thing
  | Spot

/** Whether a place is a particular thing on the page. */
export const isThing = (where: Place): where is Thing =>
  typeof where === 'object' && 'thing' in where

/** One step of a performance. */
export type Step =
  | {
      op: 'to'
      set: Record<string, Value>
      over?: number
      bounce?: number
      hold?: number
    }
  | {
      op: 'by'
      set: Record<string, Value>
      over?: number
      bounce?: number
      hold?: number
    }
  | {
      op: 'wave'
      channel: string
      amp: Value
      period: number
      for: number
      shape?: 'sine' | 'square' | 'noise'
    }
  | {
      op: 'follow'
      channel: string
      signal: string
      amp: Value
      for?: number
    }
  | { op: 'wait'; ms: Value }
  | { op: 'seq'; steps: Array<Step> }
  | { op: 'par'; steps: Array<Step> }
  | { op: 'stagger'; steps: Array<Step>; gap: number }
  | { op: 'repeat'; times: number; step: Step }
  | { op: 'vary'; of: Array<Step>; weights?: Array<number> }
  | { op: 'look'; at: Place; over?: number; hold?: number }
  | {
      op: 'feature'
      id: string
      side?: FeatureSide
      set?: Record<string, Value>
      remove?: boolean
    }
  | { op: 'go'; to: Place; size?: number; over?: number }
  | { op: 'burst'; x?: number; y?: number; strength?: Value }
  | {
      op: 'use'
      name: string
      args?: Record<string, number>
      intensity?: number
    }
  | { op: 'release'; channels?: Array<string>; over?: number }

/** What each step does, for the manual a model reads before writing one. */
export const STEP_MANUAL: Record<Step['op'], string> = {
  to: '{op:"to", set:{channel:value,...}, over?:ms, bounce?:0..1, hold?:ms} moves channels to values, then waits `hold`.',
  by: '{op:"by", set:{channel:delta,...}, over?, bounce?, hold?} moves channels by an amount from where they are headed.',
  wave: '{op:"wave", channel, amp, period:ms, for:ms, shape?:"sine"|"square"|"noise"} oscillates a channel around wherever it is; put it in a par to run beside other steps.',
  follow:
    '{op:"follow", channel, signal, amp, for?:ms} ties a channel to a signal the page measures as it happens ("sound.level", "sound.low", "sound.beat", ...): each frame the channel is `amp` times the signal away from wherever it is, so it moves only as the thing measured does. With `for` it lasts that long; without, as long as the performance holds, which with keep is until something lets go.',
  wait: '{op:"wait", ms} does nothing for a while.',
  seq: '{op:"seq", steps:[...]} one after another.',
  par: '{op:"par", steps:[...]} all at once; lasts as long as the longest.',
  stagger:
    '{op:"stagger", steps:[...], gap:ms} all, each starting `gap` after the one before.',
  repeat:
    '{op:"repeat", times, step} the step, several times; draws are fresh each time.',
  vary: '{op:"vary", of:[...], weights?:[...]} one of the steps, drawn by weight.',
  look: '{op:"look", at:"person"|"pointer"|"composer"|"text"|"artifact"|"centre"|{x,y in -1..1}|{thing}, over?, hold?} turns the gaze.',
  feature:
    '{op:"feature", id:"brow.left", side?:"left"|"right"|"centre", set?:{param:value}, remove?:true} adds a feature made of the same matter, or removes one. Its channels are id.param.',
  go: '{op:"go", to:"home"|"composer"|"text"|"artifact"|"centre"|"pointer"|{x,y in 0..1 of the window}|{thing}, size?:0.5..4, over?} moves the whole face on the page: the eyes turn there first, then it travels and settles ("artifact" is beside the artifact card in view).',
  burst:
    '{op:"burst", x?, y?, strength?} kicks the matter outward from a point in face units.',
  use: '{op:"use", name, args?, intensity?} plays a named performance from the book inside this one.',
  release:
    '{op:"release", channels?:[...], over?} lets go of channels so they return to what lies beneath, and ends what they followed.',
}

/** The place that is a particular thing on the page, for the same manual. */
export const THING_MANUAL =
  '{thing:"tool:<id>", text?:"words in it", line?:12} is one particular thing on the page, as a place for look and go: a tool call, a message, an artifact, by the name the page lists for it (face.read part "page"). "<kind>:last" is the newest of a kind and "<kind>:failed" the newest that failed. `text` narrows it to the first place those words appear inside it; `line` to a numbered line. Gone to, the face stands beside it, looks at it and marks it; out of view, it waits at the edge the thing is beyond, and the person’s tap on the face brings the thing into view.'

/** A performance as written: steps, and whether what it set stays when it ends. */
export interface Program {
  readonly steps: Array<Step>
  /** Keep the final values and any added features after it ends, until something else lets go. */
  readonly keep?: boolean
}

/** Something that happens at a moment of a performance, ready to run. */
export type Cue =
  | {
      at: number
      kind: 'hold'
      channel: string
      value: number
      relative: boolean
      over: number
      bounce: number
    }
  | {
      at: number
      kind: 'wave'
      channel: string
      amp: number
      period: number
      until: number
      shape: 'sine' | 'square' | 'noise'
      phase: number
    }
  | {
      at: number
      kind: 'follow'
      channel: string
      signal: string
      amp: number
      /** When it lets go; left out, it holds as long as the performance does. */
      until?: number
    }
  | { at: number; kind: 'look'; place: Place; over: number }
  | {
      at: number
      kind: 'feature'
      id: string
      side: FeatureSide
      remove: boolean
    }
  | { at: number; kind: 'go'; place: Place; size?: number; over: number }
  | { at: number; kind: 'burst'; x: number; y: number; strength: number }
  | { at: number; kind: 'release'; channels?: Array<string>; over: number }

/** A checked performance: its cues in order, how long it runs, what was adjusted. */
export interface Score {
  readonly cues: ReadonlyArray<Cue>
  readonly ms: number
  readonly keep: boolean
  readonly seed: number
  /** Things the checker changed rather than refused, such as a value pulled into bounds. */
  readonly notes: ReadonlyArray<string>
  /** Features the performance adds to the face as it stood when checked. The player keeps its own account of who put what there. */
  readonly adds: ReadonlyArray<string>
}

export interface Refusal {
  readonly ok: false
  /** Where in the program, such as `steps[2].set["eye.w"]`. */
  readonly path: string
  readonly reason: string
}

export type Checked =
  ({ readonly ok: true } & { readonly score: Score }) | Refusal

/** What compiling needs from where it runs. */
export interface CompileContext {
  readonly channels: Channels
  /** Looks a named performance up in the book. */
  readonly lookup?: (name: string) => Program | undefined
  readonly seed?: number
  readonly args?: Record<string, number>
  /** Scales how far from rest the performance goes: 0 nothing, 1 as written, up to 2. */
  readonly intensity?: number
  /**
   * What a thing a step names comes to on the page: what there is to say
   * about it (nothing, when it is plainly there), or `undefined` when nothing
   * has the name. Left out, things are not looked for.
   */
  readonly thing?: (thing: Thing) => ReadonlyArray<string> | undefined
  /** A thing that is not on the page refuses the program; otherwise it is a note, and the face stays where it is. */
  readonly strict?: boolean
}

export const LIMITS = {
  /** The longest a performance may run, in milliseconds. */
  ms: 30_000,
  /** The most cues one may compile to. */
  cues: 600,
  depth: 10,
  repeat: 24,
  uses: 4,
  /** The most characters of `text` a thing is searched for. */
  text: 200,
} as const

const PLACES = [
  'person',
  'pointer',
  'centre',
  'composer',
  'text',
  'home',
  'artifact',
]

class Failure extends Error {
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(reason)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Accepts a program, a bare list of steps, or a single step. */
export function asProgram(input: unknown): Program | undefined {
  if (Array.isArray(input)) return { steps: input as Array<Step> }
  if (!isRecord(input)) return undefined
  if (Array.isArray(input.steps) && input.op === undefined)
    return { steps: input.steps as Array<Step>, keep: input.keep === true }
  if (typeof input.op === 'string') return { steps: [input as unknown as Step] }
  return undefined
}

interface Run {
  readonly view: Channels
  readonly random: Random
  readonly cues: Array<Cue>
  readonly notes: Array<string>
  readonly adds: Set<string>
  readonly lookup?: (name: string) => Program | undefined
  readonly thing?: (thing: Thing) => ReadonlyArray<string> | undefined
  readonly strict: boolean
}

interface Frame {
  readonly args: Record<string, number>
  readonly intensity: number
  readonly depth: number
  readonly uses: number
}

/**
 * Checks a program and lays it out in time. Nothing is run. A wrong program
 * is refused with the place and the reason; a value out of bounds is pulled
 * in and noted instead.
 */
export function compile(input: unknown, context: CompileContext): Checked {
  const program = asProgram(input)
  if (!program)
    return {
      ok: false,
      path: '',
      reason: 'A program is {steps:[...]}, a list of steps, or one step.',
    }
  const seed = (context.seed ?? 1) >>> 0
  // Features the program adds have channels from its first step on.
  const view = new Channels(context.channels.features())
  const run: Run = {
    view,
    random: seeded(seed),
    cues: [],
    notes: [],
    adds: new Set(),
    lookup: context.lookup,
    ...(context.thing ? { thing: context.thing } : {}),
    strict: context.strict === true,
  }
  try {
    declareFeatures(program.steps, 'steps', run, 0)
    const ms = sequence(program.steps, 'steps', 0, run, {
      args: context.args ?? {},
      intensity: clamp(context.intensity ?? 1, 0, 2),
      depth: 0,
      uses: 0,
    })
    if (ms > LIMITS.ms)
      throw new Failure(
        '',
        `It runs ${Math.round(ms)} ms; the most is ${LIMITS.ms}.`,
      )
    run.cues.sort((a, b) => a.at - b.at)
    return {
      ok: true,
      score: {
        cues: run.cues,
        ms,
        keep: program.keep === true,
        seed,
        notes: run.notes,
        adds: [...run.adds],
      },
    }
  } catch (error) {
    if (error instanceof Failure)
      return { ok: false, path: error.path, reason: error.reason }
    throw error
  }
}

/** Finds every feature a program adds, so later steps may name its channels. */
function declareFeatures(
  steps: unknown,
  path: string,
  run: Run,
  depth: number,
) {
  if (!Array.isArray(steps) || depth > LIMITS.depth) return
  steps.forEach((step: unknown, index) => {
    if (!isRecord(step)) return
    const here = `${path}[${index}]`
    if (step.op === 'feature' && step.remove !== true) {
      const id = step.id
      if (typeof id !== 'string' || !FEATURE_ID.test(id))
        throw new Failure(
          `${here}.id`,
          'A feature id is a short lowercase name such as "brow.left".',
        )
      const side = step.side ?? guessSide(id)
      if (side !== 'left' && side !== 'right' && side !== 'centre')
        throw new Failure(
          `${here}.side`,
          'side is "left", "right" or "centre".',
        )
      if (!run.view.feature(id)) {
        const refusal = run.view.addFeature({ id, side })
        if (refusal) throw new Failure(here, refusal)
        run.adds.add(id)
      }
    }
    for (const key of ['steps', 'of'] as const)
      if (Array.isArray(step[key]))
        declareFeatures(step[key], `${here}.${key}`, run, depth + 1)
    if (isRecord(step.step))
      declareFeatures([step.step], `${here}.step`, run, depth + 1)
  })
}

const guessSide = (id: string): FeatureSide =>
  id.endsWith('.left') ? 'left' : id.endsWith('.right') ? 'right' : 'centre'

function sequence(
  steps: unknown,
  path: string,
  at: number,
  run: Run,
  frame: Frame,
) {
  if (!Array.isArray(steps))
    throw new Failure(path, 'This must be a list of steps.')
  let cursor = at
  steps.forEach((step: unknown, index) => {
    cursor += place(step, `${path}[${index}]`, cursor, run, frame)
  })
  return cursor - at
}

const duration = (
  value: unknown,
  path: string,
  fallback: number,
  max = LIMITS.ms,
) => {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Failure(path, 'This is a time in milliseconds, 0 or more.')
  return Math.min(value, max)
}

function number(value: unknown, path: string, run: Run, frame: Frame): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (isRecord(value)) {
    const { rand, arg, or } = value
    if (
      Array.isArray(rand) &&
      rand.length === 2 &&
      rand.every((n) => typeof n === 'number' && Number.isFinite(n))
    )
      return between(run.random, rand[0] as number, rand[1] as number)
    if (typeof arg === 'string') {
      const given = frame.args[arg]
      if (typeof given === 'number' && Number.isFinite(given)) return given
      if (typeof or === 'number' && Number.isFinite(or)) return or
      throw new Failure(
        path,
        `This needs the argument "${arg}", which was not passed and has no "or".`,
      )
    }
  }
  throw new Failure(
    path,
    'This is a number, {rand:[low,high]} or {arg:"name", or:number}.',
  )
}

function channelsOf(name: string, path: string, run: Run) {
  const channels = run.view.expand(name)
  if (channels.length === 0) {
    const near = run.view.nearest(name)
    throw new Failure(
      path,
      `No channel "${name}".${near ? ` Did you mean "${near}"?` : ''}`,
    )
  }
  return channels
}

/** A thing's name: a kind, a colon, and the rest. */
const THING = /^[a-z][a-z0-9-]{0,23}:\S{1,160}$/

function thingOf(value: Record<string, unknown>, path: string): Thing {
  const { thing, text, line } = value
  if (typeof thing !== 'string' || !THING.test(thing))
    throw new Failure(
      `${path}.thing`,
      'thing is a name the page lists, as "kind:id": "tool:failed", "artifact:last".',
    )
  if (text !== undefined && (typeof text !== 'string' || text.trim() === ''))
    throw new Failure(`${path}.text`, 'text is the words to find in the thing.')
  if (
    line !== undefined &&
    (typeof line !== 'number' || !Number.isInteger(line) || line < 1)
  )
    throw new Failure(`${path}.line`, 'line is a line number, from 1.')
  return {
    thing,
    ...(typeof text === 'string'
      ? { text: text.trim().slice(0, LIMITS.text) }
      : {}),
    ...(typeof line === 'number' ? { line } : {}),
  }
}

/** A thing as the page has it now: refused or noted when it is not there, noted when it is not simply there. */
function onPage(thing: Thing, path: string, run: Run): Thing {
  if (!run.thing) return thing
  const said = run.thing(thing)
  const note = (text: string) => {
    const line = `${path}: ${text}`
    if (!run.notes.includes(line)) run.notes.push(line)
  }
  if (said) said.forEach(note)
  else if (run.strict)
    throw new Failure(
      `${path}.thing`,
      `Nothing on the page is named "${thing.thing}". face.read with part "page" lists what is.`,
    )
  else
    note(
      `nothing on the page is named "${thing.thing}"; the face stays where it is.`,
    )
  return thing
}

function placeOf(
  value: unknown,
  path: string,
  bounds: readonly [number, number],
  run: Run,
): Place {
  if (typeof value === 'string' && PLACES.includes(value)) return value as Place
  if (isRecord(value) && value.thing !== undefined)
    return onPage(thingOf(value, path), path, run)
  if (
    isRecord(value) &&
    typeof value.x === 'number' &&
    typeof value.y === 'number'
  )
    return {
      x: clamp(value.x, bounds[0], bounds[1]),
      y: clamp(value.y, bounds[0], bounds[1]),
    }
  throw new Failure(
    path,
    `This is one of ${PLACES.map((p) => `"${p}"`).join(', ')}, {x, y} or {thing}.`,
  )
}

function push(run: Run, cue: Cue, path: string) {
  if (run.cues.length >= LIMITS.cues)
    throw new Failure(path, `A performance has at most ${LIMITS.cues} cues.`)
  run.cues.push(cue)
}

/** Lays one step out at a time and returns how long it takes. */
function place(
  step: unknown,
  path: string,
  at: number,
  run: Run,
  frame: Frame,
): number {
  if (!isRecord(step) || typeof step.op !== 'string')
    throw new Failure(path, 'A step is an object with an "op".')
  if (frame.depth > LIMITS.depth)
    throw new Failure(path, 'Steps are nested too deeply.')
  const inner = { ...frame, depth: frame.depth + 1 }
  switch (step.op) {
    case 'to':
    case 'by': {
      if (!isRecord(step.set))
        throw new Failure(`${path}.set`, 'set is {channel: value, ...}.')
      const over = duration(step.over, `${path}.over`, 240)
      const bounce = clamp(
        typeof step.bounce === 'number' ? step.bounce : 0,
        0,
        1,
      )
      const relative = step.op === 'by'
      for (const [name, raw] of Object.entries(step.set)) {
        const here = `${path}.set[${JSON.stringify(name)}]`
        const written = number(raw, here, run, frame)
        for (const channel of channelsOf(name, here, run)) {
          const spec = run.view.spec(channel)
          if (!spec) continue
          let value = relative
            ? written * frame.intensity
            : spec.rest + (written - spec.rest) * frame.intensity
          if (!relative) {
            const inside = clamp(value, spec.min, spec.max)
            if (inside !== value && frame.intensity === 1)
              run.notes.push(
                `${channel} ${written} is outside ${spec.min}..${spec.max}; used ${inside}.`,
              )
            value = inside
          }
          push(
            run,
            { at, kind: 'hold', channel, value, relative, over, bounce },
            here,
          )
        }
      }
      return over + duration(step.hold, `${path}.hold`, 0)
    }
    case 'wave': {
      if (typeof step.channel !== 'string')
        throw new Failure(`${path}.channel`, 'channel is a channel name.')
      const period = duration(step.period, `${path}.period`, 600)
      if (period < 40)
        throw new Failure(`${path}.period`, 'A wave period is at least 40 ms.')
      const length = duration(step.for, `${path}.for`, period * 2)
      const shape = step.shape ?? 'sine'
      if (shape !== 'sine' && shape !== 'square' && shape !== 'noise')
        throw new Failure(
          `${path}.shape`,
          'shape is "sine", "square" or "noise".',
        )
      const amp = number(step.amp, `${path}.amp`, run, frame) * frame.intensity
      const phase = run.random()
      for (const channel of channelsOf(step.channel, `${path}.channel`, run))
        push(
          run,
          {
            at,
            kind: 'wave',
            channel,
            amp,
            period,
            until: at + length,
            shape,
            phase,
          },
          path,
        )
      return length
    }
    case 'follow': {
      if (typeof step.channel !== 'string')
        throw new Failure(`${path}.channel`, 'channel is a channel name.')
      const signal = step.signal
      if (typeof signal !== 'string' || !isSignal(signal))
        throw new Failure(
          `${path}.signal`,
          `signal is one of ${SIGNAL_NAMES.join(', ')}.`,
        )
      const length =
        step.for === undefined
          ? undefined
          : duration(step.for, `${path}.for`, 0)
      const amp = number(step.amp, `${path}.amp`, run, frame) * frame.intensity
      for (const channel of channelsOf(step.channel, `${path}.channel`, run))
        push(
          run,
          {
            at,
            kind: 'follow',
            channel,
            signal,
            amp,
            ...(length === undefined ? {} : { until: at + length }),
          },
          path,
        )
      return length ?? 0
    }
    case 'wait':
      return Math.max(
        0,
        Math.min(LIMITS.ms, number(step.ms, `${path}.ms`, run, frame)),
      )
    case 'seq':
      return sequence(step.steps, `${path}.steps`, at, run, inner)
    case 'par': {
      if (!Array.isArray(step.steps))
        throw new Failure(`${path}.steps`, 'steps is a list of steps.')
      let longest = 0
      step.steps.forEach((child: unknown, index) => {
        longest = Math.max(
          longest,
          place(child, `${path}.steps[${index}]`, at, run, inner),
        )
      })
      return longest
    }
    case 'stagger': {
      if (!Array.isArray(step.steps))
        throw new Failure(`${path}.steps`, 'steps is a list of steps.')
      const gap = duration(step.gap, `${path}.gap`, 80)
      let longest = 0
      step.steps.forEach((child: unknown, index) => {
        const start = index * gap
        longest = Math.max(
          longest,
          start +
            place(child, `${path}.steps[${index}]`, at + start, run, inner),
        )
      })
      return longest
    }
    case 'repeat': {
      const times = step.times
      if (
        typeof times !== 'number' ||
        !Number.isInteger(times) ||
        times < 1 ||
        times > LIMITS.repeat
      )
        throw new Failure(
          `${path}.times`,
          `times is a whole number from 1 to ${LIMITS.repeat}.`,
        )
      let cursor = at
      for (let turn = 0; turn < times; turn++)
        cursor += place(step.step, `${path}.step`, cursor, run, inner)
      return cursor - at
    }
    case 'vary': {
      const options = step.of
      if (!Array.isArray(options) || options.length === 0)
        throw new Failure(`${path}.of`, 'of is a list of one or more steps.')
      const weights = Array.isArray(step.weights) ? step.weights : []
      const indexes = options.map((_, index) => index)
      const chosen =
        weighted(run.random, indexes, (index) => {
          const weight: unknown = weights[index]
          return typeof weight === 'number' ? weight : 1
        }) ?? 0
      return place(options[chosen], `${path}.of[${chosen}]`, at, run, inner)
    }
    case 'look': {
      const over = duration(step.over, `${path}.over`, 200)
      push(
        run,
        {
          at,
          kind: 'look',
          place: placeOf(step.at, `${path}.at`, [-1, 1], run),
          over,
        },
        path,
      )
      return over + duration(step.hold, `${path}.hold`, 0)
    }
    case 'feature': {
      const id = step.id
      if (typeof id !== 'string')
        throw new Failure(`${path}.id`, 'id is the feature’s name.')
      const known = run.view.feature(id)
      if (!known)
        throw new Failure(`${path}.id`, `The face has no feature "${id}".`)
      if (step.remove === true) {
        push(
          run,
          { at, kind: 'feature', id, side: known.side, remove: true },
          path,
        )
        return 0
      }
      push(
        run,
        { at, kind: 'feature', id, side: known.side, remove: false },
        path,
      )
      if (step.set !== undefined) {
        if (!isRecord(step.set))
          throw new Failure(`${path}.set`, 'set is {param: value, ...}.')
        const set = Object.fromEntries(
          Object.entries(step.set).map(([param, value]) => [
            `${id}.${param}`,
            value,
          ]),
        )
        place({ op: 'to', set, over: 0 }, path, at, run, inner)
      }
      return 0
    }
    case 'go': {
      const over = duration(step.over, `${path}.over`, 620)
      const size = step.size
      if (
        size !== undefined &&
        (typeof size !== 'number' || !Number.isFinite(size))
      )
        throw new Failure(`${path}.size`, 'size is a number from 0.5 to 4.')
      push(
        run,
        {
          at,
          kind: 'go',
          place: placeOf(step.to, `${path}.to`, [0, 1], run),
          ...(size === undefined ? {} : { size: clamp(size, 0.5, 4) }),
          over,
        },
        path,
      )
      return over
    }
    case 'burst': {
      const read = (value: unknown, fallback: number) =>
        typeof value === 'number' && Number.isFinite(value) ? value : fallback
      push(
        run,
        {
          at,
          kind: 'burst',
          x: clamp(read(step.x, 0), -50, 50),
          y: clamp(read(step.y, 0), -32, 32),
          strength:
            clamp(
              step.strength === undefined
                ? 120
                : number(step.strength, `${path}.strength`, run, frame),
              0,
              600,
            ) * frame.intensity,
        },
        path,
      )
      return 0
    }
    case 'use': {
      if (typeof step.name !== 'string')
        throw new Failure(`${path}.name`, 'name is a performance in the book.')
      if (frame.uses >= LIMITS.uses)
        throw new Failure(
          path,
          'Performances are used inside each other too deeply.',
        )
      const found = run.lookup?.(step.name)
      if (!found)
        throw new Failure(
          `${path}.name`,
          `The book has no performance "${step.name}".`,
        )
      const args = isRecord(step.args)
        ? Object.fromEntries(
            Object.entries(step.args).filter(
              (entry): entry is [string, number] =>
                typeof entry[1] === 'number',
            ),
          )
        : {}
      const scale =
        typeof step.intensity === 'number' ? clamp(step.intensity, 0, 2) : 1
      declareFeatures(found.steps, `${path}<${step.name}>`, run, 0)
      return sequence(found.steps, `${path}<${step.name}>`, at, run, {
        args: { ...frame.args, ...args },
        intensity: clamp(frame.intensity * scale, 0, 2),
        depth: frame.depth + 1,
        uses: frame.uses + 1,
      })
    }
    case 'release': {
      const over = duration(step.over, `${path}.over`, 340)
      let channels: Array<string> | undefined
      if (step.channels !== undefined) {
        if (!Array.isArray(step.channels))
          throw new Failure(
            `${path}.channels`,
            'channels is a list of channel names.',
          )
        channels = step.channels.flatMap((name: unknown, index) => {
          if (typeof name !== 'string')
            throw new Failure(
              `${path}.channels[${index}]`,
              'A channel name is text.',
            )
          return [...channelsOf(name, `${path}.channels[${index}]`, run)]
        })
      }
      push(
        run,
        { at, kind: 'release', ...(channels ? { channels } : {}), over },
        path,
      )
      return 0
    }
    default:
      throw new Failure(
        `${path}.op`,
        `No step "${step.op}". The steps are ${Object.keys(STEP_MANUAL).join(', ')}.`,
      )
  }
}
