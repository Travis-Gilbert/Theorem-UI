// SOURCING: reaction rules as data with a weighted, seeded draw, as behaviour systems for game characters choose among fitting responses rather than mapping one stimulus to one response; the gauges come from lib/face/memory. The rules themselves are this app's, and any of them can be replaced or added to at run time by the agent or the person (`face.define`).
import { clamp } from './channels'
import type { Channels } from './channels'
import type { Book, Shelf } from './book'
import { matches } from './memory'
import type { FaceEvent, Memory, Mood, Reading } from './memory'
import { compile } from './program'
import type { Program } from './program'
import { weighted } from './random'
import type { Random } from './random'

/** A number the face reads off its memory and mood when deciding. */
export const GAUGES = [
  'streak',
  'fast',
  'slow',
  'novelty',
  'habit',
  'arousal',
  'valence',
  'focus',
] as const
export type Gauge = (typeof GAUGES)[number]

/** One thing the face may do about one kind of event. */
export interface Rule {
  readonly id: string
  /** The event kind, or the last few kinds in order ending with it. A trailing `*` matches any ending. */
  readonly on: string | ReadonlyArray<string>
  /** With a sequence: the longest it may have taken, in milliseconds. */
  readonly within?: number
  /** Each gauge named must lie within its bounds, inclusive. */
  readonly when?: Partial<Record<Gauge, readonly [number, number]>>
  /** A performance from the book by name, or a program. */
  readonly do: string | Program
  /**
   * The event kind that ends it. With this the rule gives the face a form,
   * not a passing reaction: what it does is held, beneath reactions and
   * performances, from the event in `on` until this one. A trailing `*`
   * matches any ending.
   */
  readonly until?: string
  /** Scales the performance; the event's novelty and the mood scale it further. */
  readonly intensity?: number
  /** How likely against the other rules that fit; 1 unless said. */
  readonly weight?: number
  /** Milliseconds over which it grows likely again after firing. */
  readonly cooldown?: number
  readonly note?: string
  readonly by?: 'theo' | 'agent' | 'person'
}

const rule = (
  id: string,
  on: Rule['on'],
  does: string,
  rest: Partial<Omit<Rule, 'id' | 'on' | 'do'>> = {},
): Rule => ({ id, on, do: does, by: 'theo', ...rest })

/**
 * How Theo reacts before anyone teaches it otherwise. Several rules fit most
 * events, and which fires is drawn, so the same poke does not always get the
 * same face; streaks and frequency move it through different ones.
 */
export const DEFAULT_RULES: ReadonlyArray<Rule> = [
  // A poke, by how many in a row.
  rule('poke-startle', 'person.poke', 'startle', {
    when: { streak: [1, 1] },
    weight: 2,
  }),
  rule('poke-perk', 'person.poke', 'perk', { when: { streak: [1, 2] } }),
  rule('poke-curious', 'person.poke', 'curious', { when: { streak: [1, 3] } }),
  rule('poke-squint', 'person.poke', 'squint', {
    when: { streak: [2, 4] },
    weight: 2,
  }),
  rule('poke-wince', 'person.poke', 'wince', { when: { streak: [2, 5] } }),
  rule('poke-glare', 'person.poke', 'glare', {
    when: { streak: [4, 7] },
    weight: 3,
  }),
  rule('poke-shake', 'person.poke', 'shake', { when: { streak: [4, 8] } }),
  rule('poke-dizzy', 'person.poke', 'dizzy', {
    when: { streak: [7, 999] },
    weight: 3,
  }),
  rule('poke-melt', 'person.poke', 'melt', { when: { streak: [8, 999] } }),
  rule('poke-sigh', 'person.poke', 'sigh', { when: { streak: [6, 999] } }),
  // Being stroked.
  rule('pet-happy', 'person.pet', 'happy', { weight: 2 }),
  rule('pet-joy', 'person.pet', 'joy', {
    when: { streak: [2, 999] },
    weight: 2,
  }),
  rule('pet-sparkle', 'person.pet', 'sparkle', { when: { valence: [0.3, 1] } }),
  rule('pet-wink', 'person.pet', 'wink', { when: { habit: [0.2, 1] } }),
  // Being carried and put down.
  rule('drop-shake', 'person.drop', 'shake', { weight: 2 }),
  rule('drop-dizzy', 'person.drop', 'dizzy', {
    when: { fast: [3, 999] },
    weight: 3,
  }),
  rule('drop-perk', 'person.drop', 'perk'),
  // Being thrown, and meeting the edge of the page. What a knock does to the
  // head and the near eye is the engine's (Face.bump); these are what the face
  // makes of it, and they turn on how wound up it already is.
  rule('throw-startle', 'person.throw', 'startle', {
    when: { streak: [1, 1] },
    weight: 2,
  }),
  rule('throw-perk', 'person.throw', 'perk'),
  rule('throw-joy', 'person.throw', 'joy', {
    when: { valence: [0.25, 1] },
    weight: 2,
  }),
  rule('throw-dizzy', 'person.throw', 'dizzy', {
    when: { fast: [3, 999] },
    weight: 3,
  }),
  rule('bump-wince', 'body.bump.*', 'wince', { weight: 2, cooldown: 900 }),
  rule('bump-squint', 'body.bump.*', 'squint', {
    when: { arousal: [0, 0.5] },
    intensity: 0.7,
    cooldown: 900,
  }),
  rule('bump-glare', 'body.bump.*', 'glare', {
    when: { arousal: [0.55, 1], valence: [-1, 0.1] },
    weight: 2,
    cooldown: 2_000,
  }),
  rule('bump-dizzy', 'body.bump.*', 'dizzy', {
    when: { arousal: [0.7, 1] },
    weight: 2,
    cooldown: 4_000,
  }),
  // Meeting Kit: thrown into it, or struck by it. The knock is the engine's as
  // with an edge; what the face makes of someone it knows is not what it
  // makes of a wall.
  rule('meet-startle', 'body.meet.kit', 'startle', {
    weight: 2,
    cooldown: 900,
  }),
  rule('meet-wince', 'body.meet.kit', 'wince', { cooldown: 900 }),
  rule('meet-curious', 'body.meet.kit', 'curious', {
    when: { arousal: [0, 0.6] },
    cooldown: 1_500,
  }),
  rule('meet-wink', 'body.meet.kit', 'wink', {
    when: { valence: [0.2, 1] },
    weight: 2,
    cooldown: 3_000,
  }),
  rule('meet-dizzy', 'body.meet.kit', 'dizzy', {
    when: { streak: [3, 999] },
    weight: 3,
    cooldown: 4_000,
  }),
  // The person sends, or comes back.
  rule('send-perk', 'person.send', 'perk', { intensity: 0.7 }),
  rule('send-nod', 'person.send', 'nod', { intensity: 0.8 }),
  rule('send-flurry', 'person.send', 'startle', {
    when: { fast: [3, 999] },
    intensity: 0.6,
    weight: 2,
  }),
  rule('return-wake', 'person.return', 'perk', { cooldown: 60_000 }),
  rule('return-wink', 'person.return', 'wink', {
    cooldown: 120_000,
    weight: 0.5,
  }),
  // The run.
  rule('tool-scan', 'run.tool', 'scan', {
    when: { streak: [4, 999] },
    cooldown: 12_000,
  }),
  rule('tool-curious', 'run.tool', 'curious', {
    when: { novelty: [0.7, 1] },
    cooldown: 20_000,
    weight: 0.6,
  }),
  rule('fail-wince', 'run.tool.fail', 'wince', {
    when: { streak: [1, 1] },
    weight: 2,
  }),
  rule('fail-worry', 'run.tool.fail', 'worry', {
    when: { fast: [1.5, 999] },
    weight: 2,
  }),
  rule('fail-glare', 'run.tool.fail', 'glare', {
    when: { fast: [3, 999] },
    weight: 3,
  }),
  rule('error-worry', 'run.error', 'worry', { weight: 2 }),
  rule('error-sigh', 'run.error', 'sigh'),
  rule('done-done', 'run.done', 'done', { weight: 3 }),
  rule('done-joy', 'run.done', 'joy', {
    when: { valence: [0.3, 1] },
    weight: 2,
  }),
  rule('done-relief', ['run.tool.fail', 'run.done'], 'sigh', {
    within: 120_000,
    weight: 4,
    note: 'Finished right after a failure: relief, not cheer.',
  }),
  rule('done-wink', 'run.done', 'wink', { when: { habit: [0.5, 1] } }),
  // Sound the page plays. The first two are forms: held from the sound's start to its stop.
  rule('sound-boombox', 'sound.start', 'boombox', {
    until: 'sound.stop',
    weight: 3,
    note: 'What plays aloud is shown as a loudspeaker.',
  }),
  rule('sound-speak', 'sound.start', 'speak', {
    until: 'sound.stop',
    note: 'Or as a mouth, now and then.',
  }),
  rule('sound-thump', 'sound.loud', 'thump', { cooldown: 3_000 }),
  // The environment.
  rule('resize-startle', 'env.resize', 'startle', {
    when: { streak: [1, 1] },
    intensity: 0.5,
    cooldown: 8_000,
  }),
  rule('resize-wince', 'env.resize', 'wince', {
    when: { streak: [3, 999] },
    cooldown: 6_000,
  }),
  rule('theme-sparkle', 'env.theme', 'sparkle', { weight: 2 }),
  rule('theme-perk', 'env.theme', 'perk'),
  rule('offline-worry', 'env.offline', 'worry', { weight: 3 }),
  rule('online-happy', 'env.online', 'happy', { weight: 3 }),
  rule('copy-wink', 'env.copy', 'wink', { weight: 0.3, cooldown: 30_000 }),
]

/** What the face decided to do about an event. */
export interface Reaction {
  readonly rule: Rule
  readonly program: Program
  /** The book name, when the rule names one. */
  readonly name?: string
  readonly intensity: number
}

const SHELF_KEY = 'theorem-ui:theo:rules'
export const RULE_LIMITS = {
  added: 32,
  id: /^[a-z][a-z0-9-]{1,39}$/,
  kind: /^[a-z][a-z0-9.]{1,39}\*?$/,
} as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Chooses what to do about each event. Every rule that fits is a candidate,
 * weighted down if it fired lately, and doing nothing is always a candidate
 * too; the draw is seeded, so a run can be replayed.
 */
export class Reactions {
  private readonly added: Array<Rule> = []
  private readonly fired = new Map<string, number>()
  private lastRule: string | undefined

  constructor(
    private readonly book: Book,
    private readonly random: Random,
    private readonly shelf?: Shelf,
  ) {
    try {
      const saved: unknown = JSON.parse(shelf?.getItem(SHELF_KEY) ?? '[]')
      if (Array.isArray(saved))
        for (const item of saved as Array<Rule>)
          if (typeof item.id === 'string' && RULE_LIMITS.id.test(item.id))
            this.added.push(item)
    } catch {
      // No saved rules.
    }
  }

  /** Every rule in force: added ones replace built-in ones of the same id. */
  rules(): ReadonlyArray<Rule> {
    const ids = new Set(this.added.map((item) => item.id))
    return [...DEFAULT_RULES.filter((item) => !ids.has(item.id)), ...this.added]
  }

  /** Adds or replaces a rule after checking it; a refusal says where and why. */
  define(
    input: unknown,
    by: 'agent' | 'person',
    channels: Channels,
  ): { ok: true; rule: Rule } | { ok: false; path: string; reason: string } {
    const refuse = (path: string, reason: string) => ({
      ok: false as const,
      path,
      reason,
    })
    if (!isRecord(input)) return refuse('rule', 'A rule is {id, on, do, ...}.')
    const { id, on, within, when, intensity, weight, cooldown, note, until } =
      input
    if (typeof id !== 'string' || !RULE_LIMITS.id.test(id))
      return refuse(
        'rule.id',
        'id is 2 to 40 lowercase letters, digits or hyphens.',
      )
    const kinds = typeof on === 'string' ? [on] : on
    if (
      !Array.isArray(kinds) ||
      kinds.length === 0 ||
      kinds.length > 6 ||
      !kinds.every(
        (kind): kind is string =>
          typeof kind === 'string' && RULE_LIMITS.kind.test(kind),
      )
    )
      return refuse(
        'rule.on',
        'on is an event kind such as "person.poke", or up to six in order; a trailing * matches any ending.',
      )
    if (
      until !== undefined &&
      (typeof until !== 'string' || !RULE_LIMITS.kind.test(until))
    )
      return refuse(
        'rule.until',
        'until is the event kind that ends it, such as "sound.stop".',
      )
    const gauges: Partial<Record<Gauge, readonly [number, number]>> = {}
    if (when !== undefined) {
      if (!isRecord(when))
        return refuse('rule.when', 'when is {gauge: [low, high], ...}.')
      for (const [gauge, range] of Object.entries(when)) {
        if (!(GAUGES as ReadonlyArray<string>).includes(gauge))
          return refuse(
            `rule.when.${gauge}`,
            `No gauge "${gauge}". The gauges are ${GAUGES.join(', ')}.`,
          )
        if (
          !Array.isArray(range) ||
          range.length !== 2 ||
          !range.every((n) => typeof n === 'number')
        )
          return refuse(
            `rule.when.${gauge}`,
            'A gauge is bounded as [low, high].',
          )
        gauges[gauge as Gauge] = [range[0] as number, range[1] as number]
      }
    }
    const does = input.do
    if (typeof does === 'string') {
      if (!this.book.get(does))
        return refuse('rule.do', `The book has no performance "${does}".`)
    } else {
      const checked = compile(does, { channels, lookup: this.book.lookup })
      if (!checked.ok) return refuse(`rule.do.${checked.path}`, checked.reason)
      if (JSON.stringify(does).length > 4000)
        return refuse(
          'rule.do',
          'A rule’s own program is at most 4000 characters; save it to the book and name it.',
        )
    }
    const replaces = this.added.findIndex((item) => item.id === id)
    if (replaces < 0 && this.added.length >= RULE_LIMITS.added)
      return refuse(
        'rule',
        `At most ${RULE_LIMITS.added} rules may be added; remove one first.`,
      )
    const num = (value: unknown, low: number, high: number) =>
      typeof value === 'number' && Number.isFinite(value)
        ? clamp(value, low, high)
        : undefined
    const made: Rule = {
      id,
      on: typeof on === 'string' ? on : kinds,
      ...(num(within, 0, 3_600_000) === undefined
        ? {}
        : { within: num(within, 0, 3_600_000) }),
      ...(Object.keys(gauges).length > 0 ? { when: gauges } : {}),
      do: does as string | Program,
      ...(num(intensity, 0, 2) === undefined
        ? {}
        : { intensity: num(intensity, 0, 2) }),
      ...(num(weight, 0, 20) === undefined
        ? {}
        : { weight: num(weight, 0, 20) }),
      ...(num(cooldown, 0, 3_600_000) === undefined
        ? {}
        : { cooldown: num(cooldown, 0, 3_600_000) }),
      ...(typeof note === 'string' ? { note: note.slice(0, 200) } : {}),
      ...(typeof until === 'string' ? { until } : {}),
      by,
    }
    if (replaces >= 0) this.added[replaces] = made
    else this.added.push(made)
    this.save()
    return { ok: true, rule: made }
  }

  /** Removes an added rule; a built-in one it replaced comes back. */
  remove(id: string) {
    const index = this.added.findIndex((item) => item.id === id)
    if (index < 0) return false
    this.added.splice(index, 1)
    this.save()
    return true
  }

  private save() {
    try {
      this.shelf?.setItem(SHELF_KEY, JSON.stringify(this.added))
    } catch {
      // Kept for this visit only.
    }
  }

  /** The rules that fit an event as read against memory and mood. */
  fitting(event: FaceEvent, reading: Reading, mood: Mood, memory: Memory) {
    const gauge = (name: Gauge) =>
      name === 'arousal' || name === 'valence' || name === 'focus'
        ? mood[name]
        : reading[name]
    return this.rules().filter((item) => {
      const kinds = typeof item.on === 'string' ? [item.on] : item.on
      if (!matches(kinds.at(-1) ?? '', event.kind)) return false
      if (kinds.length > 1 && !memory.endsWith(kinds, item.within)) return false
      for (const [name, range] of Object.entries(item.when ?? {})) {
        const value = gauge(name as Gauge)
        if (value < range[0] || value > range[1]) return false
      }
      return true
    })
  }

  /**
   * The form the face takes for something that has begun and will last: one
   * of the fitting rules that say what ends it, drawn by weight. Doing nothing
   * is not a candidate here. A form is how the face shows a thing is going
   * on, so it is not left out by chance.
   */
  form(
    event: FaceEvent,
    reading: Reading,
    mood: Mood,
    memory: Memory,
  ): Reaction | undefined {
    const fitting = this.fitting(event, reading, mood, memory).filter(
      (item) => item.until !== undefined,
    )
    const chosen = weighted(this.random, fitting, (item) => item.weight ?? 1)
    if (!chosen) return undefined
    const named = typeof chosen.do === 'string' ? chosen.do : undefined
    const program = named ? this.book.lookup(named) : (chosen.do as Program)
    if (!program) return undefined
    return {
      rule: chosen,
      program,
      ...(named ? { name: named } : {}),
      intensity: clamp(chosen.intensity ?? 1, 0.3, 1.6),
    }
  }

  /**
   * Decides. `undefined` is a decision too: sometimes the face lets a thing
   * pass, and more often the more habitual the thing is.
   */
  react(
    event: FaceEvent,
    reading: Reading,
    mood: Mood,
    memory: Memory,
  ): Reaction | undefined {
    const fitting = this.fitting(event, reading, mood, memory).filter(
      (item) => item.until === undefined,
    )
    if (fitting.length === 0) return undefined
    const weightOf = (item: Rule) => {
      const since = event.at - (this.fired.get(item.id) ?? -Infinity)
      const cooldown = item.cooldown ?? 4_000
      const rested = cooldown > 0 ? 1 - Math.exp(-since / cooldown) : 1
      const repeat = item.id === this.lastRule ? 0.35 : 1
      return (item.weight ?? 1) * rested * repeat
    }
    const total = fitting.reduce((sum, item) => sum + weightOf(item), 0)
    // Doing nothing weighs more for a habitual, familiar thing, and never for a first.
    const quiet =
      total * (0.08 + 0.5 * reading.habit) * (1 - reading.novelty * 0.9)
    const chosen = weighted<Rule | undefined>(
      this.random,
      [...fitting, undefined],
      (item) => (item ? weightOf(item) : quiet),
    )
    if (!chosen) return undefined
    const named = typeof chosen.do === 'string' ? chosen.do : undefined
    const program = named ? this.book.lookup(named) : (chosen.do as Program)
    if (!program) return undefined
    this.fired.set(chosen.id, event.at)
    this.lastRule = chosen.id
    return {
      rule: chosen,
      program,
      ...(named ? { name: named } : {}),
      intensity: clamp(
        (chosen.intensity ?? 1) *
          (0.6 + 0.55 * reading.novelty) *
          (0.85 + 0.4 * mood.arousal),
        0.3,
        1.6,
      ),
    }
  }
}
