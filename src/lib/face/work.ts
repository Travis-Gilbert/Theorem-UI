// SOURCING: a leaky integrator (each event adds, the sum decays exponentially), the usual way to turn discrete events into a rate, as lib/sound/meter turns samples into a level; the reasoning effort levels are lib/theorem/generation's, lowest first. Which events count and how much are this app's (docs/plans/theo-orb.md).
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

/**
 * What the run is doing, as numbers the face can follow: how busy it is with
 * tools, and how hard it was asked to think. Counted from what the run
 * reports; nothing here guesses.
 */
export class Work {
  private pace = 0
  private at: number | undefined
  /** The effort the run was sent with, 0 to 1. */
  effort = 0.5

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
    }
  }
}

let work: Work | undefined
/** The page's one count of what the run is doing. */
export const theWork = () => (work ??= new Work())
