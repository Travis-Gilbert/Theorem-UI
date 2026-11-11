// SOURCING: habituation and novelty as behaviour-based robots model them (a stimulus repeated loses its effect, a new one gains; Kismet's drives, which the handoff cites, docs/plans/theo-face.md), kept as exponentially decayed counts like lib/life/energy.ts; a days-long baseline per kind so what is ordinary in this person's environment stops being remarkable. The numbers are this app's.
import { clamp } from './channels'
import type { Shelf } from './book'

/** Something that happened: the person did it, a run did it, the environment did, or it happened to the figure's own body. */
export interface FaceEvent {
  /** A dotted kind: `person.poke`, `run.tool.fail`, `env.resize`, `body.bump.left`. */
  readonly kind: string
  /** When, in milliseconds. */
  readonly at: number
  /** How much it counts; 1 unless said. */
  readonly weight?: number
}

/** What an event is like against what came before it. */
export interface Reading {
  /** How many of its kind lately, decayed over seconds. */
  readonly fast: number
  /** How many of its kind lately, decayed over minutes. */
  readonly slow: number
  /** How many of its kind in a row with only short gaps, this one included. */
  readonly streak: number
  /** Milliseconds since the last of its kind; `Infinity` for the first. */
  readonly gap: number
  /** 0..1: how ordinary this kind is on this device over past days. */
  readonly habit: number
  /** 0..1: 1 the first time, falling as it becomes frequent or habitual. */
  readonly novelty: number
}

/** How the face feels, slowly: each drifts back to rest. */
export interface Mood {
  /** 0 torpid to 1 wound up. */
  arousal: number
  /** -1 sour to 1 pleased. */
  valence: number
  /** 0 idle to 1 absorbed. */
  focus: number
}

export const MOOD_REST: Readonly<Mood> = {
  arousal: 0.25,
  valence: 0.1,
  focus: 0.15,
}

const FAST_HALF = 8_000
const SLOW_HALF = 300_000
const MOOD_HALF = 45_000
const STREAK_GAP = 2_600
const DAY = 86_400_000
const RECENT = 24
const SHELF_KEY = 'theorem-ui:theo:days'

/** What each kind of event does to the mood. The longest matching prefix wins. */
const NUDGES: ReadonlyArray<readonly [string, Partial<Mood>]> = [
  ['person.poke', { arousal: 0.16, valence: 0.03 }],
  ['person.pet', { valence: 0.14, arousal: -0.04 }],
  ['person.drop', { arousal: 0.1 }],
  ['person.throw', { arousal: 0.18, valence: 0.02 }],
  ['person.send', { arousal: 0.1, focus: 0.12 }],
  ['person.type', { focus: 0.02 }],
  ['person.return', { arousal: 0.12, valence: 0.05 }],
  ['run.start', { focus: 0.22, arousal: 0.08 }],
  ['run.tool.fail', { valence: -0.18, arousal: 0.14 }],
  ['run.tool', { focus: 0.04 }],
  ['run.error', { valence: -0.25, arousal: 0.12 }],
  ['run.ask', { arousal: 0.1 }],
  ['run.done', { valence: 0.2, arousal: -0.06, focus: -0.2 }],
  ['env.offline', { valence: -0.15, arousal: 0.1 }],
  ['env.online', { valence: 0.12 }],
  ['env.', { arousal: 0.05 }],
  ['body.bump', { arousal: 0.14, valence: -0.05 }],
]

interface KindMemory {
  fast: number
  slow: number
  last: number
  streak: number
}

interface Days {
  day: number
  today: Record<string, number>
  usual: Record<string, number>
}

const decay = (value: number, elapsed: number, half: number) =>
  value * 0.5 ** (Math.max(0, elapsed) / half)

/**
 * What the face remembers: how often each kind of thing has happened over
 * seconds, minutes and days, the last few events in order, and a mood.
 * The same event read against a different past gives a different reading,
 * which is what makes a reaction depend on what came before.
 */
export class Memory {
  private readonly kinds = new Map<string, KindMemory>()
  readonly recent: Array<FaceEvent> = []
  readonly mood: Mood = { ...MOOD_REST }
  private moodAt = 0
  private days: Days = { day: 0, today: {}, usual: {} }
  private savedAt = 0

  constructor(private readonly shelf?: Shelf) {
    try {
      const saved = JSON.parse(
        shelf?.getItem(SHELF_KEY) ?? 'null',
      ) as Partial<Days> | null
      if (saved && typeof saved.day === 'number' && saved.today && saved.usual)
        this.days = { day: saved.day, today: saved.today, usual: saved.usual }
    } catch {
      // No past is a fine past.
    }
  }

  /** Takes an event in and says what it is like against the past. */
  note(event: FaceEvent): Reading {
    const weight = event.weight ?? 1
    const known = this.kinds.get(event.kind)
    const gap = known ? event.at - known.last : Infinity
    const memory: KindMemory = known ?? {
      fast: 0,
      slow: 0,
      last: event.at,
      streak: 0,
    }
    memory.fast =
      decay(memory.fast, gap === Infinity ? 0 : gap, FAST_HALF) + weight
    memory.slow =
      decay(memory.slow, gap === Infinity ? 0 : gap, SLOW_HALF) + weight
    memory.streak = gap <= STREAK_GAP ? memory.streak + 1 : 1
    memory.last = event.at
    this.kinds.set(event.kind, memory)

    this.recent.push(event)
    if (this.recent.length > RECENT) this.recent.shift()

    this.roll(event.at)
    const habit = this.habit(event.kind)
    this.days.today[event.kind] = (this.days.today[event.kind] ?? 0) + weight
    if (event.at - this.savedAt > 30_000) this.save(event.at)

    this.settle(event.at)
    for (const [prefix, nudge] of NUDGES) {
      if (!event.kind.startsWith(prefix)) continue
      // A habitual thing moves the mood less.
      const scale = weight * (1 - 0.6 * habit)
      this.mood.arousal = clamp(
        this.mood.arousal + (nudge.arousal ?? 0) * scale,
        0,
        1,
      )
      this.mood.valence = clamp(
        this.mood.valence + (nudge.valence ?? 0) * scale,
        -1,
        1,
      )
      this.mood.focus = clamp(
        this.mood.focus + (nudge.focus ?? 0) * scale,
        0,
        1,
      )
      break
    }

    return {
      fast: memory.fast,
      slow: memory.slow,
      streak: memory.streak,
      gap,
      habit,
      novelty: clamp(1 / (1 + (memory.slow - weight) * 0.6 + habit * 3), 0, 1),
    }
  }

  /** Lets the mood drift toward rest up to `now`. */
  settle(now: number) {
    if (this.moodAt === 0) this.moodAt = now
    const keep = 0.5 ** (Math.max(0, now - this.moodAt) / MOOD_HALF)
    this.moodAt = now
    this.mood.arousal =
      MOOD_REST.arousal + (this.mood.arousal - MOOD_REST.arousal) * keep
    this.mood.valence =
      MOOD_REST.valence + (this.mood.valence - MOOD_REST.valence) * keep
    this.mood.focus =
      MOOD_REST.focus + (this.mood.focus - MOOD_REST.focus) * keep
    return this.mood
  }

  /** 0..1: how ordinary a kind is here, from its usual count per day. */
  habit(kind: string) {
    const usual = this.days.usual[kind] ?? 0
    return usual / (usual + 20)
  }

  /** Whether the last events, newest last, end with these kinds inside a span. `run.*` matches a prefix. */
  endsWith(kinds: ReadonlyArray<string>, within = Infinity) {
    if (kinds.length === 0 || kinds.length > this.recent.length) return false
    const tail = this.recent.slice(-kinds.length)
    const first = tail[0] as FaceEvent
    const last = tail.at(-1) as FaceEvent
    if (last.at - first.at > within) return false
    return kinds.every((kind, index) =>
      matches(kind, (tail[index] as FaceEvent).kind),
    )
  }

  /** A new day folds yesterday's counts into what is usual. */
  private roll(now: number) {
    const day = Math.floor(now / DAY)
    if (this.days.day === 0) this.days.day = day
    if (day === this.days.day) return
    const kinds = new Set([
      ...Object.keys(this.days.usual),
      ...Object.keys(this.days.today),
    ])
    const usual: Record<string, number> = {}
    for (const kind of kinds) {
      const value =
        (this.days.usual[kind] ?? 0) * 0.7 + (this.days.today[kind] ?? 0) * 0.3
      if (value >= 0.05) usual[kind] = Math.round(value * 100) / 100
    }
    this.days = { day, today: {}, usual }
    this.save(now)
  }

  private save(now: number) {
    this.savedAt = now
    try {
      this.shelf?.setItem(SHELF_KEY, JSON.stringify(this.days))
    } catch {
      // The baseline is a nicety; losing it is not an error.
    }
  }
}

/** Whether an event kind is the one a rule names; a trailing `*` matches any ending. */
export const matches = (pattern: string, kind: string) =>
  pattern.endsWith('*')
    ? kind.startsWith(pattern.slice(0, -1))
    : pattern === kind
