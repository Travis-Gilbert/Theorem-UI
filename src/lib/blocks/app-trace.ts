// SOURCING: @jridgewell/trace-mapping (a position in a bundle back to the
// file and line it was written on). What counts as the App's own frame, and
// the problem it becomes, is this app's.
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
import type { AppProblem } from './app-source'
import type { HostedBuild } from './hosted-app'
import type { FrameError } from './sandbox/protocol'

/** `…:12:34` or `…:12:34)` at the end of a stack line. */
const FRAME = /:(\d+):(\d+)\)?\s*$/

/** The places an error names, nearest first: where it was thrown, then its callers. */
function positions(error: FrameError): Array<{ line: number; column: number }> {
  const found: Array<{ line: number; column: number }> = []
  if (error.line) found.push({ line: error.line, column: error.column ?? 1 })
  for (const text of error.stack?.split('\n') ?? []) {
    const frame = FRAME.exec(text)
    if (frame) found.push({ line: Number(frame[1]), column: Number(frame[2]) })
  }
  return found
}

/**
 * What a frame's uncaught error is, in the App's own source when the App was
 * built from source: the nearest place in one of its files, not in a module
 * it imports. A plain HTML App's error is reported as the frame gave it.
 */
export function traceFrameError(
  error: FrameError,
  build?: HostedBuild,
): AppProblem {
  const message =
    error.name && !error.message.includes(error.name)
      ? `${error.name}: ${error.message}`
      : error.message
  const problem: AppProblem = { kind: 'runtime', message }
  if (!build) return problem
  const map = new TraceMap(build.map)
  for (const { line, column } of positions(error)) {
    // The bundle's first line is the one after its script tag.
    const generated = line - build.scriptLine
    if (generated < 1) continue
    const original = originalPositionFor(map, {
      line: generated,
      column: Math.max(column - 1, 0),
    })
    // The map holds the App's own files only: anything else maps to nothing.
    if (original.source === null) continue
    return {
      ...problem,
      file: original.source,
      line: original.line,
      column: original.column + 1,
    }
  }
  return problem
}
