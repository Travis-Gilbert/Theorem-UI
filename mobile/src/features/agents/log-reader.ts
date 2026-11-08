// SOURCING: readScript / lineLengthScript output (./shell); the line readers in ./claude-log and ./codex-log
//
// Follows one agent log on a computer: the last part of it first, then
// whatever is appended. Only whole lines are applied, so a line the agent is
// still writing is read on a later poll. Nothing here writes to the computer.
import { applyClaudeLine } from './claude-log'
import { applyCodexLine } from './codex-log'
import type { Runner } from './remote'
import { afterMark, lineLengthScript, readScript, type Agent } from './shell'
import { emptyTranscript, oversizedNote, assistantTurn, type Transcript } from './transcript'

/** How much of the end of a log the first read shows. */
export const TAIL_BYTES = 200_000

export type PollResult = {
  /** New lines were applied. */
  changed: boolean
  /** The reader reached the end of what the computer has written. */
  caughtUp: boolean
  /** The log is no longer on the computer. */
  missing: boolean
}

type Read = { size: number; from: number; lines: string[]; used: number } | { missing: true }

function parseRead(stdout: string): Read {
  const lines = afterMark(stdout)
  if (!lines) throw new Error('The computer did not run the read.')
  if (lines[0] === '@@missing') return { missing: true }
  const size = Number(lines[0]?.match(/^@@size (\d+)$/)?.[1])
  const from = Number(lines[1]?.match(/^@@from (\d+)$/)?.[1])
  const used = Number(lines.at(-1)?.match(/^@@used (\d+)$/)?.[1])
  if (![size, from, used].every(Number.isFinite)) throw new Error('The computer sent a read Theorem could not parse.')
  return { size, from, used, lines: lines.slice(2, -1) }
}

export class LogFollower {
  transcript: Transcript = emptyTranscript()
  /** Byte offset of the next unread line; -1 before the first read. */
  private offset = -1
  /** The first read started after the beginning of the log. */
  startedMidway = false
  private readonly apply: (transcript: Transcript, line: string) => boolean

  constructor(
    readonly agent: Agent,
    readonly path: string,
    private readonly tailBytes = TAIL_BYTES,
  ) {
    this.apply = agent === 'claude' ? applyClaudeLine : applyCodexLine
  }

  /** Reads until caught up, or `maxReads` reads. */
  async poll(run: Runner, maxReads = 8): Promise<PollResult> {
    let changed = false
    for (let reads = 0; reads < maxReads; reads++) {
      const first = this.offset < 0
      const read = parseRead(await run(readScript(this.path, first ? -this.tailBytes : this.offset)))
      if ('missing' in read) return { changed, caughtUp: true, missing: true }
      if (!first && read.size < this.offset) {
        // Rewritten from the start: read it again rather than show a mix.
        this.transcript = emptyTranscript()
        this.offset = -1
        this.startedMidway = false
        changed = true
        continue
      }
      if (first) this.startedMidway = read.from > 0
      for (const line of read.lines) if (this.apply(this.transcript, line)) changed = true
      this.offset = read.from + read.used
      if (this.offset >= read.size) return { changed, caughtUp: true, missing: false }
      if (read.used > 0) continue

      // One line is longer than a whole read: step over it once it is complete.
      const length = Number(afterMark(await run(lineLengthScript(this.path, this.offset)))?.[0])
      if (!Number.isFinite(length) || length <= 0) return { changed, caughtUp: true, missing: false }
      // The partial line a midway first read starts in was never meant to be shown.
      if (!(first && read.from > 0)) {
        assistantTurn(this.transcript, `oversized-${this.offset}`).blocks.push({
          type: 'note',
          text: oversizedNote(length),
        })
        changed = true
      }
      this.offset += length
    }
    return { changed, caughtUp: false, missing: false }
  }
}
