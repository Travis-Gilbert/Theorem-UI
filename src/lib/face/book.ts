// SOURCING: the reference robot's range (docs/plans/evidence/ledger.md, "Theo reference": rounded boxes, slanted glares, half lids, blinks to a line) restated in this face's channels; named performances kept as immutable versions with their invocations recorded apart, as the handoff asks (docs/plans/theo-face.md). Every entry is ordinary program JSON: nothing here is a special case the player knows about, so anything in this file could have been written by a model at run time.
import { asProgram, compile } from './program'
import type { Program } from './program'
import type { Channels } from './channels'

/** A named performance: what it is for, and its program. */
export interface Entry {
  readonly name: string
  readonly version: number
  readonly note: string
  readonly program: Program
  /** Who wrote it: the face's own, the agent, or the person. */
  readonly by: 'theo' | 'agent' | 'person'
}

const lids = [
  'eyes.lid',
  'eyes.low',
  'eyes.lidTilt',
  'eyes.lowBow',
  'eyes.lowTilt',
  'eyes.lidBow',
]

const own = (name: string, note: string, program: Program): Entry => ({
  name,
  version: 1,
  note,
  program,
  by: 'theo',
})

/** What Theo can do before anyone teaches it anything. */
export const BUILT_IN: ReadonlyArray<Entry> = [
  own('blink', 'A plain blink.', {
    steps: [
      { op: 'to', set: { 'eyes.lid': 1 }, over: 70, hold: 45 },
      { op: 'release', channels: ['eyes.lid'], over: 130 },
    ],
  }),
  own('wink', 'One eye shuts, with a tilt of the head.', {
    steps: [
      {
        op: 'to',
        set: { 'eye.left.lid': 1, 'eye.left.lowBow': 0.5, 'face.tilt': -6 },
        over: 110,
        hold: 260,
      },
    ],
  }),
  own('nod', 'Yes: the head dips twice.', {
    steps: [
      {
        op: 'repeat',
        times: 2,
        step: {
          op: 'seq',
          steps: [
            { op: 'to', set: { 'face.dy': 5, 'eyes.lid': 0.25 }, over: 120 },
            {
              op: 'to',
              set: { 'face.dy': -1.5, 'eyes.lid': 0 },
              over: 140,
              bounce: 0.3,
            },
          ],
        },
      },
    ],
  }),
  own('shake', 'No: the head turns side to side.', {
    steps: [
      {
        op: 'par',
        steps: [
          { op: 'wave', channel: 'face.dx', amp: 5, period: 240, for: 720 },
          { op: 'wave', channel: 'gaze.x', amp: 0.35, period: 240, for: 720 },
          { op: 'to', set: { 'eyes.lid': 0.2 }, over: 120, hold: 600 },
        ],
      },
    ],
  }),
  own('perk', 'Alert: the eyes open tall and the head lifts.', {
    steps: [
      {
        op: 'to',
        set: { 'eyes.h': 15.5, 'eyes.w': 12.6, 'face.dy': -3 },
        over: 160,
        bounce: 0.5,
        hold: 520,
      },
    ],
  }),
  own('squint', 'Narrowed eyes: doubt, or looking closely.', {
    steps: [
      {
        op: 'to',
        set: { 'eyes.lid': 0.38, 'eyes.low': 0.3 },
        over: 200,
        hold: 800,
      },
    ],
  }),
  own('glare', 'Slanted lids: cross, or bearing down on something.', {
    steps: [
      {
        op: 'to',
        set: { 'eyes.lidTilt': 0.75, 'eyes.lid': 0.16, 'face.dy': 1.5 },
        over: 170,
        hold: 950,
      },
    ],
  }),
  own('worry', 'Lids slanting outward and down: concern.', {
    steps: [
      {
        op: 'to',
        set: {
          'eyes.lidTilt': -0.62,
          'eyes.h': 12,
          'face.dy': 2,
          'face.tilt': 4,
        },
        over: 260,
        hold: 900,
      },
    ],
  }),
  own('happy', 'Smiling eyes: the lower lids rise into arcs.', {
    steps: [
      {
        op: 'to',
        set: { 'eyes.lowBow': 0.95, 'eyes.low': 0.22, 'face.dy': -2 },
        over: 190,
        bounce: 0.4,
        hold: 900,
      },
    ],
  }),
  own('joy', 'Smiling eyes and a little bounce.', {
    steps: [
      {
        op: 'par',
        steps: [
          { op: 'use', name: 'happy' },
          { op: 'wave', channel: 'face.dy', amp: 2.6, period: 270, for: 810 },
        ],
      },
    ],
  }),
  own('think', 'Looking up and away with one eye narrowed.', {
    steps: [
      {
        op: 'par',
        steps: [
          { op: 'look', at: { x: 0.55, y: -0.6 }, over: 320, hold: 1200 },
          {
            op: 'to',
            set: { 'eye.left.lid': 0.34, 'face.tilt': 7 },
            over: 320,
            hold: 1200,
          },
        ],
      },
    ],
  }),
  own('curious', 'A tilted head, one eye taller than the other.', {
    steps: [
      {
        op: 'to',
        set: { 'face.tilt': -10, 'eye.right.h': 15.6, 'eye.left.h': 11.6 },
        over: 240,
        bounce: 0.35,
        hold: 900,
      },
    ],
  }),
  own(
    'startle',
    'A jump: the eyes go wide and round and the matter scatters.',
    {
      steps: [
        { op: 'burst', strength: { arg: 'kick', or: 90 } },
        {
          op: 'to',
          set: {
            'eyes.h': 16.5,
            'eyes.w': 13.6,
            'eyes.round': 2.6,
            'face.scale': 1.08,
            'matter.jitter': 0.3,
          },
          over: 90,
          bounce: 0.6,
          hold: 300,
        },
      ],
    },
  ),
  own('wince', 'Eyes screwed shut for a moment.', {
    steps: [
      {
        op: 'to',
        set: { 'eyes.lid': 0.8, 'eyes.lidTilt': 0.5, 'face.squash': 0.12 },
        over: 90,
        hold: 320,
      },
    ],
  }),
  own('dizzy', 'Ring eyes and a wobbling head.', {
    steps: [
      {
        op: 'par',
        steps: [
          {
            op: 'to',
            set: {
              'eyes.hollow': 0.72,
              'eyes.round': 2,
              'eyes.w': 12.5,
              'eyes.h': 12.5,
            },
            over: 200,
            hold: 1300,
          },
          { op: 'wave', channel: 'face.tilt', amp: 9, period: 700, for: 1500 },
          { op: 'wave', channel: 'gaze.x', amp: 0.5, period: 500, for: 1500 },
          { op: 'wave', channel: 'gaze.y', amp: 0.5, period: 500, for: 1500 },
        ],
      },
    ],
  }),
  own('sigh', 'The lids and head sink, then come back slowly.', {
    steps: [
      {
        op: 'to',
        set: { 'eyes.lid': 0.5, 'face.dy': 3.5, 'matter.glow': 0.8 },
        over: 520,
        hold: 520,
      },
      { op: 'release', over: 700 },
    ],
  }),
  own('scan', 'The gaze sweeps across, as if reading.', {
    steps: [
      {
        op: 'par',
        steps: [
          { op: 'wave', channel: 'gaze.x', amp: 0.7, period: 950, for: 1900 },
          {
            op: 'to',
            set: { 'eyes.lid': 0.2, 'gaze.y': 0.25 },
            over: 200,
            hold: 1700,
          },
        ],
      },
    ],
  }),
  own(
    'visit',
    'Goes to the artifact in view: looks at it, travels to its side, and looks it over.',
    {
      steps: [
        { op: 'look', at: 'artifact', over: 240, hold: 220 },
        { op: 'go', to: 'artifact', size: 1.8, over: 700 },
        { op: 'wait', ms: 950 },
        {
          op: 'par',
          steps: [
            { op: 'look', at: 'artifact', over: 220 },
            {
              op: 'to',
              set: { 'face.tilt': -7, 'eye.right.h': 15, 'eye.left.h': 12 },
              over: 240,
              bounce: 0.3,
              hold: 1300,
            },
          ],
        },
      ],
    },
  ),
  own('melt', 'The matter lets go of its shape and sags.', {
    steps: [
      {
        op: 'to',
        set: {
          'matter.cohesion': 0.12,
          'matter.drift': 0.8,
          'eyes.y': 7,
          'eyes.h': 10,
        },
        over: 600,
        hold: 900,
      },
    ],
  }),
  own('sparkle', 'A shimmer through the matter.', {
    steps: [
      {
        op: 'par',
        steps: [
          {
            op: 'wave',
            channel: 'matter.glow',
            amp: 0.3,
            period: 180,
            for: 900,
          },
          {
            op: 'wave',
            channel: 'matter.size',
            amp: 0.35,
            period: 230,
            for: 900,
            shape: 'noise',
          },
          { op: 'to', set: { 'matter.jitter': 0.35 }, over: 120, hold: 780 },
        ],
      },
    ],
  }),
  own(
    'skeptic',
    'One brow up. The brows are features this performance adds: nothing about the face had them before.',
    {
      steps: [
        {
          op: 'par',
          steps: [
            {
              op: 'feature',
              id: 'brow.left',
              set: {
                w: 11,
                h: 1.7,
                y: -20,
                x: 20,
                round: 6,
                share: 0.3,
                turn: -8,
              },
            },
            {
              op: 'feature',
              id: 'brow.right',
              set: {
                w: 11,
                h: 1.7,
                y: -20,
                x: 20,
                round: 6,
                share: 0.3,
                turn: 4,
              },
            },
            { op: 'to', set: { 'eyes.h': 10.5, 'eyes.y': 4 }, over: 220 },
          ],
        },
        {
          op: 'to',
          set: {
            'brow.left.y': -24,
            'brow.left.turn': -16,
            'eye.right.lid': 0.3,
            'face.tilt': -5,
          },
          over: 260,
          bounce: 0.4,
          hold: 1100,
        },
      ],
    },
  ),
  // The four below are what the face settles into for the run's liveness; they keep until the liveness changes.
  own(
    'attend',
    'Listening to the person: open eyes turned to where they type.',
    {
      keep: true,
      steps: [
        {
          op: 'par',
          steps: [
            { op: 'to', set: { 'eyes.h': 14.2 }, over: 220 },
            { op: 'look', at: 'composer', over: 260 },
          ],
        },
      ],
    },
  ),
  own('focus', 'Working: lowered lids, a busy gaze, tight matter.', {
    keep: true,
    steps: [
      {
        op: 'to',
        set: {
          'eyes.lid': 0.24,
          'eyes.low': 0.1,
          'gaze.y': 0.22,
          'auto.saccade': 1.9,
          'auto.blink': 0.7,
          'matter.cohesion': 0.92,
        },
        over: 320,
      },
    ],
  }),
  own(
    'ask',
    'Waiting on the person: wide eyes and a tilted head, looking at them.',
    {
      keep: true,
      steps: [
        {
          op: 'par',
          steps: [
            {
              op: 'to',
              set: { 'eyes.h': 15.2, 'eyes.round': 3.2, 'face.tilt': 8 },
              over: 260,
              bounce: 0.4,
            },
            { op: 'look', at: 'person', over: 260 },
          ],
        },
      ],
    },
  ),
  own('sleep', 'Asleep: shut eyes, dim, breathing slowly.', {
    keep: true,
    steps: [
      {
        op: 'to',
        set: { 'eyes.lid': 0.55, 'face.dy': 2 },
        over: 700,
        hold: 500,
      },
      {
        op: 'to',
        set: {
          'eyes.lid': 1,
          'face.dy': 3.5,
          'face.tilt': 5,
          'matter.glow': 0.5,
          'matter.drift': 0.05,
          'auto.blink': 0,
          'auto.saccade': 0,
          'auto.breath': 1.9,
        },
        over: 900,
      },
    ],
  }),
  own('wake', 'Waking: a slow half-open, a blink, then alert.', {
    steps: [
      { op: 'to', set: { 'eyes.lid': 0.6 }, over: 320, hold: 220 },
      { op: 'use', name: 'blink' },
      { op: 'use', name: 'perk', intensity: 0.7 },
    ],
  }),
  own('done', 'Finished: smiling eyes and a nod.', {
    steps: [
      {
        op: 'par',
        steps: [
          { op: 'use', name: 'happy' },
          { op: 'use', name: 'nod' },
        ],
      },
    ],
  }),
]

/** The channels a blink and the lids use, for layers that must let them go together. */
export const LID_CHANNELS: ReadonlyArray<string> = lids

/** What keeps the book between visits. `localStorage` in the page; a map in tests. */
export interface Shelf {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

const SHELF_KEY = 'theorem-ui:theo:book'
/** The most added performances the book holds, every version counted, and the largest one, in characters of JSON. */
export const BOOK_LIMITS = {
  entries: 64,
  size: 6000,
  name: /^[a-z][a-z0-9-]{1,31}$/,
} as const

/** Calls `visit` with every `use` step in a list of steps, however deep, read as loosely as a program is written. */
function eachUse(
  steps: unknown,
  visit: (step: Record<string, unknown> & { name: string }) => void,
  depth = 0,
) {
  if (!Array.isArray(steps) || depth > 32) return
  for (const step of steps as Array<unknown>) {
    if (typeof step !== 'object' || step === null) continue
    const fields = step as Record<string, unknown>
    if (fields.op === 'use' && typeof fields.name === 'string')
      visit(fields as Record<string, unknown> & { name: string })
    eachUse(fields.steps, visit, depth + 1)
    eachUse(fields.of, visit, depth + 1)
    if (fields.step !== undefined) eachUse([fields.step], visit, depth + 1)
  }
}

/**
 * Every named performance: the built-in ones and those the agent or the
 * person defined. A definition is never changed: defining a name again adds
 * a version, and `name@2` still means what it meant, because what it uses is
 * written down by version when it is saved.
 */
export class Book {
  private readonly entries = new Map<string, Array<Entry>>()

  constructor(private readonly shelf?: Shelf) {
    for (const entry of BUILT_IN) this.entries.set(entry.name, [entry])
    try {
      const saved: unknown = JSON.parse(shelf?.getItem(SHELF_KEY) ?? '[]')
      if (Array.isArray(saved))
        for (const entry of saved as Array<Entry>)
          if (
            typeof entry.name === 'string' &&
            BOOK_LIMITS.name.test(entry.name)
          )
            this.entries.set(entry.name, [
              ...(this.entries.get(entry.name) ?? []),
              entry,
            ])
    } catch {
      // A shelf that cannot be read is an empty shelf.
    }
  }

  /** The newest version of a name, or the version named by `name@n`. */
  get(reference: string): Entry | undefined {
    const [name = '', version] = reference.split('@')
    const versions = this.entries.get(name)
    if (!versions) return undefined
    if (version === undefined) return versions.at(-1)
    return versions.find((entry) => entry.version === Number(version))
  }

  lookup = (reference: string) => this.get(reference)?.program

  /** The newest version of each performance, built-in ones first. */
  list(): ReadonlyArray<Entry> {
    return [...this.entries.values()].flatMap((versions) => {
      const last = versions.at(-1)
      return last ? [last] : []
    })
  }

  /**
   * Adds a performance, or a new version of one. The program is checked
   * first against the face as it is; a refusal says where and why.
   */
  define(
    name: string,
    program: unknown,
    note: string,
    by: Entry['by'],
    channels: Channels,
  ): { ok: true; entry: Entry } | { ok: false; path: string; reason: string } {
    if (!BOOK_LIMITS.name.test(name))
      return {
        ok: false,
        path: 'name',
        reason:
          'A name is 2 to 32 lowercase letters, digits or hyphens, starting with a letter.',
      }
    const text = JSON.stringify(program)
    if (text.length > BOOK_LIMITS.size)
      return {
        ok: false,
        path: 'program',
        reason: `A saved performance is at most ${BOOK_LIMITS.size} characters of JSON; this is ${text.length}.`,
      }
    const checked = compile(program, { channels, lookup: this.lookup })
    if (!checked.ok) return checked
    const versions = this.entries.get(name) ?? []
    if (this.defined().length >= BOOK_LIMITS.entries)
      return {
        ok: false,
        path: 'name',
        reason: `The book holds at most ${BOOK_LIMITS.entries} added performances, each version counted; remove one first.`,
      }
    const saved = asProgram(JSON.parse(text))
    if (!saved) return { ok: false, path: '', reason: 'This is not a program.' }
    // What it uses is the version there is today, so a later revision of that name does not change this one.
    eachUse(saved.steps, (step) => {
      const used = step.name.includes('@') ? undefined : this.get(step.name)
      if (used) step.name = `${used.name}@${used.version}`
    })
    const entry: Entry = {
      name,
      version: (versions.at(-1)?.version ?? 0) + 1,
      note: note.slice(0, 240),
      program: saved,
      by,
    }
    this.entries.set(name, [...versions, entry])
    this.save()
    return { ok: true, entry }
  }

  /**
   * Removes every added version of a name, or one version given as
   * `name@version`. The face's own performances stay, and so does a version
   * another added performance uses. A version can only use versions saved
   * before it, so there is always one nothing uses to start from.
   */
  remove(reference: string): { ok: true } | { ok: false; reason: string } {
    const [name = '', version] = reference.split('@')
    const versions = this.entries.get(name) ?? []
    const going = versions.filter(
      (entry) =>
        entry.by !== 'theo' &&
        (version === undefined || entry.version === Number(version)),
    )
    if (going.length === 0)
      return {
        ok: false,
        reason: `Nothing added is named "${reference}"; Theo’s own performances stay.`,
      }
    const users = new Set<string>()
    for (const entry of this.defined()) {
      if (going.includes(entry)) continue
      eachUse(entry.program.steps, (step) => {
        const used = this.get(step.name)
        if (used && going.includes(used))
          users.add(`${entry.name}@${entry.version}`)
      })
    }
    if (users.size > 0)
      return {
        ok: false,
        reason: `"${reference}" is used by ${[...users].join(', ')}; remove ${users.size === 1 ? 'that version' : 'those versions'} first.`,
      }
    const kept = versions.filter((entry) => !going.includes(entry))
    if (kept.length > 0) this.entries.set(name, kept)
    else this.entries.delete(name)
    this.save()
    return { ok: true }
  }

  private defined() {
    return [...this.entries.values()]
      .flat()
      .filter((entry) => entry.by !== 'theo')
  }

  private save() {
    try {
      this.shelf?.setItem(SHELF_KEY, JSON.stringify(this.defined()))
    } catch {
      // A full or forbidden shelf loses the definition on reload, not now.
    }
  }
}
