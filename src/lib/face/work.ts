// SOURCING: a leaky integrator (each event adds, the sum decays exponentially), the usual way to turn discrete events into a rate, as lib/sound/meter turns samples into a level; the reasoning effort levels are lib/theorem/generation's, lowest first. Which events count and how much are this app's, as is the point past which a full conversation shows, 400,000 tokens, the owner's (docs/plans/theo-orb.md).
import { EFFORT_LEVELS } from '@/lib/theorem/generation'

/** How much one tool call starting or ending adds, how much more a failed one does, and how long the pace takes to halve, in milliseconds. */
const PUSH = 0.3
const FAILED = 1.6
const HALVES = 2400

/**
 * Where a reasoning effort level lies from least (0) to most (1). A level
 * Theorem does not list, or none at all, is the middle: it is the model's own.
 */
export function effortShare(level: string | undefined) {
  const index = level === undefined ? -1 : EFFORT_LEVELS.indexOf(level)
  return index < 0 ? 0.5 : index / (EFFORT_LEVELS.length - 1)
}

/** Up to this many tokens in its context a conversation is as composed as ever, and where it is taken to be full when the model's window is not known. */
export const COMPOSED_UNTIL = 400_000
const WINDOW_UNKNOWN = 1_000_000

/**
 * How far past `COMPOSED_UNTIL` a conversation's context is, 0 to 1: 0 up to
 * there, 1 at the model's window. Where nothing has been counted, or the
 * window is no larger than that, it is 0.
 */
export function contextShare(
  tokens: number | undefined,
  window: number | undefined,
) {
  if (tokens === undefined || !(tokens > COMPOSED_UNTIL)) return 0
  const full = window !== undefined && window > 0 ? window : WINDOW_UNKNOWN
  if (full <= COMPOSED_UNTIL) return 0
  return Math.min(1, (tokens - COMPOSED_UNTIL) / (full - COMPOSED_UNTIL))
}

/**
 * What the run is doing, as numbers the face can follow: how busy it is with
 * tools, how hard it was asked to think, and how full its context is. Counted from what the run
 * reports; nothing here guesses.
 */
export class Work {
  private pace = 0
  private at: number | undefined
  /** The effort the run was sent with, 0 to 1. */
  effort = 0.5
  /** How full the conversation's context is past where it is composed, 0 to 1. */
  context = 0

  constructor(
    /** A number in [0, 1): how hard each push lands is not the same twice. */
    private readonly random: () => number = Math.random,
  ) {}

  private settle(now: number) {
    if (this.at !== undefined && now > this.at)
      this.pace *= Math.pow(0.5, (now - this.at) / HALVES)
    this.at = now
  }

  /** A tool call started or ended at `now`, in milliseconds. */
  tool(now: number, failed = false) {
    this.settle(now)
    const push = PUSH * (0.7 + 0.6 * this.random()) * (failed ? FAILED : 1)
    this.pace = Math.min(1, this.pace + push)
  }

  /** The signals as they stand at `now`. While nothing runs they are 0. */
  measure(now: number, working: boolean) {
    this.settle(now)
    if (!working) this.pace = 0
    return {
      'run.pace': this.pace,
      'run.effort': working ? this.effort : 0,
      'run.context': working ? this.context : 0,
    }
  }
}

let work: Work | undefined
/** The page's one count of what the run is doing. */
export const theWork = () => (work ??= new Work())
