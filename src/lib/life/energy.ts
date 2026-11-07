// SOURCING: hand-rolled. How hard the model is working is Theorem's own reading of a turn (its tool calls, delegations, reasoning and text), and the response is a few lines of exponential decay and a phase accumulator for the beat; no library models either
/** What lifts the field: a stretch of text, a stretch of reasoning, or a tool call. */
export type PulseKind = 'text' | 'reasoning' | 'tool'

/**
 * How lively the field is, from 0 (at rest) to 1. `floor` is what a running
 * turn holds the level at, so the field stays awake between pulses.
 */
export interface Energy {
  readonly level: number
  readonly floor: number
}

export const RESTING: Energy = { level: 0, floor: 0 }

const PULSES: Record<PulseKind, number> = { text: 0.03, reasoning: 0.1, tool: 0.32 }
const RUNNING_FLOOR = 0.25
/** Seconds for a lift above the floor to halve. */
const HALF_LIFE = 3
/** Seconds for the level to rise halfway to a new floor. */
const RISE = 0.5

export const pulse = (energy: Energy, kind: PulseKind): Energy => ({
  ...energy,
  level: Math.min(1, energy.level + PULSES[kind]),
})

export const sustain = (energy: Energy, running: boolean): Energy => ({
  ...energy,
  floor: running ? RUNNING_FLOOR : 0,
})

export function decay(energy: Energy, seconds: number): Energy {
  const { level, floor } = energy
  const halfLife = level > floor ? HALF_LIFE : RISE
  return { floor, level: floor + (level - floor) * 0.5 ** (seconds / halfLife) }
}

/** Between `rest` at 0 and `busy` at 1, evenly in ratio, so each pulse feels alike. */
const between = (rest: number, busy: number, level: number) => rest * (busy / rest) ** level

/** Generations per second. */
export const pace = (level: number) => between(1.5, 24, level)

/**
 * How far the field is through the current generation, from 0 (it just
 * stepped) to 1 (the next is due), advanced at the pace of the moment. A step
 * lands only when the phase reaches 1, so a pulse hurries the generation in
 * hand on from where it stood rather than starting a new one. Paused, the
 * phase runs up to 1 and no step is taken.
 */
export function beat(
  phase: number,
  seconds: number,
  level: number,
  playing: boolean,
): { phase: number; steps: number } {
  const next = phase + seconds * pace(level)
  if (!playing) return { phase: Math.min(1, next), steps: 0 }
  const steps = Math.floor(next)
  return { phase: next - steps, steps }
}

/** How strongly the field's glyphs show, as a share of their full weight. */
export const glow = (level: number) => 0.45 + 0.55 * level

/** How long the presence rests before it looks for the next cell. */
export const restSeconds = (level: number) => between(12, 0.5, level)

/** A turn's activity, counted so a new count since the last look is a pulse. */
export interface Signal {
  readonly running: boolean
  readonly tools: number
  /** Stretches of reasoning, THOUGHT_CHARS each. */
  readonly thoughts: number
  /** Stretches of text, WORD_CHARS each. */
  readonly words: number
}

const THOUGHT_CHARS = 300
const WORD_CHARS = 400

/** The parts of an assistant-ui message this reads. */
interface TurnLike {
  readonly status?: { readonly type: string }
  readonly content: ReadonlyArray<{ readonly type: string; readonly text?: string }>
}

export function signalOf(turn: TurnLike | undefined): Signal {
  let tools = 0
  let reasoning = 0
  let text = 0
  for (const part of turn?.content ?? []) {
    if (part.type === 'tool-call' || part.type === 'data') tools++
    else if (part.type === 'reasoning') reasoning += part.text?.length ?? 0
    else if (part.type === 'text') text += part.text?.length ?? 0
  }
  const status = turn?.status?.type
  return {
    running: status === 'running' || status === 'requires-action',
    tools,
    thoughts: Math.floor(reasoning / THOUGHT_CHARS),
    words: Math.floor(text / WORD_CHARS),
  }
}

/** One pulse per tool call, thought and stretch of text added since `before`. */
export function pulsesBetween(before: Signal, after: Signal): PulseKind[] {
  const added = (from: number, to: number, kind: PulseKind): PulseKind[] =>
    Array.from({ length: Math.max(0, to - from) }, () => kind)
  return [
    ...added(before.tools, after.tools, 'tool'),
    ...added(before.thoughts, after.thoughts, 'reasoning'),
    ...added(before.words, after.words, 'text'),
  ]
}

/** The last message as last seen: which one, and what it had done. */
export interface Reading {
  readonly id: string | undefined
  readonly signal: Signal
}

const QUIET: Signal = { running: false, tools: 0, thoughts: 0, words: 0 }

/**
 * The pulses from one reading to the next. A different message counts from
 * nothing only while it runs; one that arrives finished, as when a thread
 * loads, was work done before the field was watching.
 */
export function pulsesSince(before: Reading, after: Reading): PulseKind[] {
  if (before.id === after.id) return pulsesBetween(before.signal, after.signal)
  return after.signal.running ? pulsesBetween(QUIET, after.signal) : []
}
