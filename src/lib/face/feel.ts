// SOURCING: none: the numbers a person may set for how Theo moves, with their bounds, kept apart from the constants that are not a matter of taste (lib/face/body's BODY, lib/face/engine's SWAY). One set for the page, as there is one face (lib/face/store); lib/figures keeps what the person chose.

/** How Theo's movement feels: every number here is the person's to change. */
export interface Feel {
  /** How fast a throw dies away, per second. */
  drag: number
  /** How much speed an edge gives back, 0 to 1. */
  bounce: number
  /** Let go slower than this, in pixels per second, it is put down, not thrown. */
  throwFrom: number
  /** How briskly it travels when sent somewhere: 1 is as the sender asked. */
  pace: number
  /** The tether's damping ratio: 1 arrives without swinging past, less overshoots and comes back. */
  settle: number
  /** How long the eyes look where it is going before it sets off, in milliseconds. */
  lead: number
  /** How hard a poke pushes it, in pixels per second. */
  recoil: number
  /** How much the face leans into travel and looks ahead of it: 1 is as designed. */
  lean: number
  /** How far the visor trails inside its holder when the speed changes: 1 is as designed. */
  trail: number
  /** How quickly the face gets over a knock, per second. */
  recover: number
}

export type FeelKey = keyof Feel

export interface FeelSpec {
  readonly key: FeelKey
  readonly group: 'Throw' | 'Travel' | 'Touch' | 'Face'
  readonly label: string
  /** What turning it does, for the person. */
  readonly hint: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly rest: number
  readonly unit?: string
}

/** Every setting, in the order a panel lists them. `rest` is what Theo ships with. */
export const FEEL_SPECS: ReadonlyArray<FeelSpec> = [
  {
    key: 'drag',
    group: 'Throw',
    label: 'Drag',
    hint: 'How quickly a throw slows. Lower carries further.',
    min: 1.5,
    max: 12,
    step: 0.1,
    rest: 4.5,
  },
  {
    key: 'bounce',
    group: 'Throw',
    label: 'Bounce',
    hint: 'How much speed the window’s edge gives back.',
    min: 0,
    max: 0.9,
    step: 0.05,
    rest: 0.35,
  },
  {
    key: 'throwFrom',
    group: 'Throw',
    label: 'Throw from',
    hint: 'Let go slower than this and it is put down, not thrown.',
    min: 40,
    max: 600,
    step: 10,
    rest: 140,
    unit: 'px/s',
  },
  {
    key: 'pace',
    group: 'Travel',
    label: 'Pace',
    hint: 'How briskly it travels when it is sent somewhere.',
    min: 0.5,
    max: 2,
    step: 0.05,
    rest: 1,
    unit: '×',
  },
  {
    key: 'settle',
    group: 'Travel',
    label: 'Settle',
    hint: 'At 1 it arrives and stops. Lower swings past and comes back.',
    min: 0.3,
    max: 1.6,
    step: 0.05,
    rest: 1,
  },
  {
    key: 'lead',
    group: 'Travel',
    label: 'Look first',
    hint: 'How long the eyes look where it is going before it sets off.',
    min: 0,
    max: 600,
    step: 10,
    rest: 170,
    unit: 'ms',
  },
  {
    key: 'recoil',
    group: 'Touch',
    label: 'Recoil',
    hint: 'How hard a poke pushes it away.',
    min: 0,
    max: 600,
    step: 10,
    rest: 220,
    unit: 'px/s',
  },
  {
    key: 'recover',
    group: 'Touch',
    label: 'Recover',
    hint: 'How quickly the face gets over a knock. Lower lingers.',
    min: 2,
    max: 20,
    step: 0.5,
    rest: 7.5,
  },
  {
    key: 'lean',
    group: 'Face',
    label: 'Lean',
    hint: 'How much the face tilts into travel and looks ahead of it.',
    min: 0,
    max: 2.5,
    step: 0.05,
    rest: 1,
    unit: '×',
  },
  {
    key: 'trail',
    group: 'Face',
    label: 'Trail',
    hint: 'How far the visor lags inside its frame when the speed changes.',
    min: 0,
    max: 2.5,
    step: 0.05,
    rest: 1,
    unit: '×',
  },
]

const shipped = () =>
  Object.fromEntries(FEEL_SPECS.map(({ key, rest }) => [key, rest])) as {
    [K in FeelKey]: number
  }

/** What Theo ships with. */
export const FEEL_REST: Readonly<Feel> = shipped()

/** The feel in force. Read where it is used, so a change shows at once. */
export const FEEL: Readonly<Feel> = shipped()

let revision = 0

/** Counts the changes to the feel, for what has to do something when it changes. */
export const feelRevision = () => revision

/** One setting's value brought inside its bounds; `undefined` for a number that is not one. */
export function feelValue(key: FeelKey, value: unknown): number | undefined {
  const spec = FEEL_SPECS.find((one) => one.key === key)
  if (!spec || typeof value !== 'number' || !Number.isFinite(value))
    return undefined
  return Math.min(spec.max, Math.max(spec.min, value))
}

/**
 * Puts a feel in force: the settings given, each inside its bounds, over
 * what Theo ships with. A setting left out, or given something that is not a
 * number, is as shipped; `tune()` is everything as shipped.
 */
export function tune(values?: Partial<Record<FeelKey, unknown>>): Feel {
  const live = FEEL as Feel
  let changed = false
  for (const { key, rest } of FEEL_SPECS) {
    const next = feelValue(key, values?.[key]) ?? rest
    if (live[key] === next) continue
    live[key] = next
    changed = true
  }
  if (changed) revision++
  return live
}
