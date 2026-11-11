// SOURCING: the continuous-control idea of the study rig (docs/plans/theo-face.md, Sources: theorem-face-study src/rig.js) and of facial rigs generally: a face is a set of named, bounded numbers, and an expression is a point in them. The channel names, bounds and rest values are this app's.

/** One number the face can be asked to hold: its bounds, where it rests, what it is. */
export interface ChannelSpec {
  readonly min: number
  readonly max: number
  readonly rest: number
  readonly note: string
}

/**
 * What every feature of the face is made of. A feature is a filled shape of
 * particles: a superellipse (`w`, `h`, `round`) bent by eight radial gains
 * (`r0`..`r7`, clockwise from the outer side), cut by an upper and a lower
 * lid, placed and turned. Lengths are face units: the visor is 100 by 64.
 */
export const FEATURE_PARAMS = {
  x: {
    min: -46,
    max: 46,
    rest: 20,
    note: 'Distance from the centre line, outward; a centre feature uses it as plain x.',
  },
  y: { min: -28, max: 28, rest: 0, note: 'Height; negative is up.' },
  w: { min: 0.5, max: 30, rest: 12, note: 'Half width.' },
  h: { min: 0.5, max: 28, rest: 13, note: 'Half height.' },
  round: {
    min: 0.7,
    max: 10,
    rest: 4,
    note: 'Corner exponent: 1 a diamond, 2 an ellipse, 4 and up a rounded box.',
  },
  r0: { min: 0.2, max: 1.8, rest: 1, note: 'Radial gain, outer side.' },
  r1: { min: 0.2, max: 1.8, rest: 1, note: 'Radial gain, outer lower corner.' },
  r2: { min: 0.2, max: 1.8, rest: 1, note: 'Radial gain, bottom.' },
  r3: { min: 0.2, max: 1.8, rest: 1, note: 'Radial gain, inner lower corner.' },
  r4: { min: 0.2, max: 1.8, rest: 1, note: 'Radial gain, inner side.' },
  r5: { min: 0.2, max: 1.8, rest: 1, note: 'Radial gain, inner upper corner.' },
  r6: { min: 0.2, max: 1.8, rest: 1, note: 'Radial gain, top.' },
  r7: { min: 0.2, max: 1.8, rest: 1, note: 'Radial gain, outer upper corner.' },
  lid: {
    min: 0,
    max: 1,
    rest: 0,
    note: 'Upper lid: 0 open, 1 shut. Shut matter gathers on the lid line.',
  },
  lidTilt: {
    min: -1,
    max: 1,
    rest: 0,
    note: 'Upper lid slant: positive drops the inner end (a glare), negative the outer (worry).',
  },
  lidBow: {
    min: -1,
    max: 1,
    rest: 0,
    note: 'Upper lid curve: positive sags in the middle, negative arches.',
  },
  low: { min: 0, max: 1, rest: 0, note: 'Lower lid: 0 open, 1 shut.' },
  lowTilt: {
    min: -1,
    max: 1,
    rest: 0,
    note: 'Lower lid slant: positive raises the inner end.',
  },
  lowBow: {
    min: -1,
    max: 1,
    rest: 0,
    note: 'Lower lid curve: positive rises in the middle (a smiling eye).',
  },
  hollow: {
    min: 0,
    max: 0.95,
    rest: 0,
    note: 'Empty middle: 0 filled, toward 1 a ring.',
  },
  turn: {
    min: -180,
    max: 180,
    rest: 0,
    note: 'Rotation in degrees, mirrored across the face.',
  },
  scale: { min: 0, max: 3, rest: 1, note: 'Size of the whole feature.' },
  alpha: { min: 0, max: 1, rest: 1, note: 'How bright its matter is.' },
  share: {
    min: 0,
    max: 4,
    rest: 1,
    note: 'Its share of the matter; matter flows between features as shares change.',
  },
} as const satisfies Record<string, ChannelSpec>

export type FeatureParam = keyof typeof FEATURE_PARAMS
export const FEATURE_PARAM_NAMES = Object.keys(
  FEATURE_PARAMS,
) as ReadonlyArray<FeatureParam>

/** The channels that are not a feature's: the head, the gaze, the matter, what it does unasked. */
export const FACE_CHANNELS = {
  'face.tilt': { min: -40, max: 40, rest: 0, note: 'Head tilt in degrees.' },
  'face.scale': { min: 0.5, max: 1.6, rest: 1, note: 'Head size.' },
  'face.dx': {
    min: -40,
    max: 40,
    rest: 0,
    note: 'Head shift sideways, face units.',
  },
  'face.dy': {
    min: -40,
    max: 40,
    rest: 0,
    note: 'Head shift; negative is up.',
  },
  'face.squash': {
    min: -0.4,
    max: 0.4,
    rest: 0,
    note: 'Positive squashes flat and wide, negative stretches tall.',
  },
  'gaze.x': {
    min: -1,
    max: 1,
    rest: 0,
    note: 'Where it looks: -1 left, 1 right.',
  },
  'gaze.y': {
    min: -1,
    max: 1,
    rest: 0,
    note: 'Where it looks: -1 up, 1 down.',
  },
  'matter.cohesion': {
    min: 0,
    max: 1,
    rest: 0.82,
    note: 'How tightly matter holds its shape: 1 crisp, 0 a loose cloud.',
  },
  'matter.jitter': { min: 0, max: 1, rest: 0.06, note: 'Fast tremble.' },
  'matter.drift': { min: 0, max: 1, rest: 0.12, note: 'Slow wander.' },
  'matter.size': { min: 0.4, max: 2.5, rest: 1, note: 'Grain size.' },
  'matter.glow': { min: 0, max: 1.5, rest: 1, note: 'Brightness.' },
  'matter.hue': {
    min: -180,
    max: 180,
    rest: 0,
    note: 'Colour, in degrees away from its own.',
  },
  'auto.blink': {
    min: 0,
    max: 3,
    rest: 1,
    note: 'How often it blinks unasked; 0 never.',
  },
  'auto.saccade': {
    min: 0,
    max: 3,
    rest: 1,
    note: 'How much its gaze flicks unasked.',
  },
  'auto.breath': { min: 0, max: 3, rest: 1, note: 'How deeply it breathes.' },
} as const satisfies Record<string, ChannelSpec>

export type FeatureSide = 'left' | 'right' | 'centre'

/** A feature as the face holds it: where it is and what it rests as. */
export interface FeatureDef {
  readonly id: string
  readonly side: FeatureSide
  /** Rest values that differ from FEATURE_PARAMS. */
  readonly rest?: Partial<Record<FeatureParam, number>>
}

/** A feature id: a short lowercase path such as `eye.left` or `brow.left`. */
export const FEATURE_ID = /^[a-z][a-z0-9]{0,15}(\.[a-z][a-z0-9]{0,15})?$/

/** The most features a face holds at once; matter is finite. */
export const MAX_FEATURES = 8

export const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value

/**
 * The live set of channels: the fixed ones, and the params of whichever
 * features the face has now. Features come and go, so this is built, not
 * declared.
 */
export class Channels {
  private readonly specs = new Map<string, ChannelSpec>()
  private readonly defs = new Map<string, FeatureDef>()

  constructor(features: ReadonlyArray<FeatureDef> = []) {
    for (const [name, spec] of Object.entries(FACE_CHANNELS))
      this.specs.set(name, spec)
    for (const feature of features) this.addFeature(feature)
  }

  /** Adds a feature's channels. Refuses a bad id, a taken id, or one too many. */
  addFeature(def: FeatureDef): string | undefined {
    if (!FEATURE_ID.test(def.id)) return `"${def.id}" is not a feature id.`
    if (
      def.id.startsWith('face') ||
      def.id.startsWith('gaze') ||
      def.id.startsWith('matter') ||
      def.id.startsWith('auto') ||
      def.id === 'eyes'
    )
      return `"${def.id}" is a reserved name.`
    if (this.defs.has(def.id)) return undefined
    if (this.defs.size >= MAX_FEATURES)
      return `The face holds at most ${MAX_FEATURES} features; remove one first.`
    this.defs.set(def.id, def)
    for (const param of FEATURE_PARAM_NAMES) {
      const base = FEATURE_PARAMS[param]
      const rest = def.rest?.[param]
      this.specs.set(`${def.id}.${param}`, {
        ...base,
        rest: rest === undefined ? base.rest : clamp(rest, base.min, base.max),
      })
    }
    return undefined
  }

  removeFeature(id: string) {
    if (!this.defs.delete(id)) return false
    for (const param of FEATURE_PARAM_NAMES) this.specs.delete(`${id}.${param}`)
    return true
  }

  features(): ReadonlyArray<FeatureDef> {
    return [...this.defs.values()]
  }

  feature(id: string) {
    return this.defs.get(id)
  }

  spec(name: string) {
    return this.specs.get(name)
  }

  names(): ReadonlyArray<string> {
    return [...this.specs.keys()]
  }

  /**
   * The channels a written name means. `eyes.w` is both eyes' `w`; any other
   * name is itself. An unknown name gives nothing.
   */
  expand(name: string): ReadonlyArray<string> {
    if (name.startsWith('eyes.')) {
      const param = name.slice(5)
      const both = [`eye.left.${param}`, `eye.right.${param}`]
      return both.every((channel) => this.specs.has(channel)) ? both : []
    }
    return this.specs.has(name) ? [name] : []
  }

  /** The known name closest to a wrong one, for an error a model can act on. */
  nearest(name: string): string | undefined {
    let best: string | undefined
    let bestScore = Infinity
    const candidates = [
      ...this.specs.keys(),
      ...FEATURE_PARAM_NAMES.map((param) => `eyes.${param}`),
    ]
    for (const candidate of candidates) {
      const score = distance(name, candidate)
      if (score < bestScore) {
        bestScore = score
        best = candidate
      }
    }
    return bestScore <= Math.max(3, name.length / 2) ? best : undefined
  }
}

/** Edit distance, small strings only. */
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] as number
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j] as number
      row[j] = Math.min(
        above + 1,
        (row[j - 1] as number) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      previous = above
    }
  }
  return row[b.length] as number
}
