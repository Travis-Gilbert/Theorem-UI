// SOURCING: object-inspect (each recorded value as one short line of text, the
// way Node's util.inspect prints it). Kept by the local server under the hash
// of the source that produced them, so they show beside that source only.
import inspect from 'object-inspect'
import type { WorkspaceId } from '@/lib/workspace/types'
import type { RunOutcome } from './sandbox/protocol'
import { isDescribed } from './sandbox/values'

/** One value shown beside a line. */
export interface LastRunLine {
  /** 1-based, in the block's source. */
  line: number
  text: string
}

/** What a block's last run produced, kept by the hash of its source. */
export interface LastRun {
  sourceHash: string
  ranAt: string
  durationMs: number
  status: 'ok' | 'error'
  error?: { message: string; name: string }
  /** The block's value, as text. */
  value?: string
  lines: Array<LastRunLine>
}

const MAX_TEXT = 120

/** A value as one short line. */
export function formatValue(value: unknown): string {
  const text = isDescribed(value)
    ? value.text
    : typeof value === 'string'
      ? JSON.stringify(value)
      : inspect(value, { depth: 2, maxStringLength: 60 })
  const flat = text.replace(/\s*\n\s*/g, ' ')
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT - 1)}…` : flat
}

/** The last-run record for one run of a block. */
export function lastRunOf(sourceHash: string, outcome: RunOutcome): LastRun {
  const lines = new Map<number, string>()
  for (const trace of outcome.traces) {
    const text = trace.variables
      ? Object.entries(trace.variables)
          .map(([name, value]) => `${name} = ${formatValue(value)}`)
          .join(', ')
      : formatValue(trace.value)
    // A line that ran more than once (in a loop, say) shows its last value.
    lines.set(trace.line, text)
  }
  return {
    sourceHash,
    ranAt: new Date().toISOString(),
    durationMs: Math.round(outcome.durationMs),
    status: outcome.status,
    ...(outcome.error && { error: outcome.error }),
    ...(outcome.value !== undefined && { value: formatValue(outcome.value) }),
    lines: [...lines]
      .sort(([a], [b]) => a - b)
      .map(([line, text]) => ({ line, text })),
  }
}

const base = (id: WorkspaceId) =>
  `/desktop/workspace/${encodeURIComponent(id)}/last-run`

/** The last run of the source with this hash, or null. */
export async function fetchLastRun(
  id: WorkspaceId,
  sourceHash: string,
): Promise<LastRun | null> {
  const response = await fetch(`${base(id)}?hash=${sourceHash}`)
  if (response.status === 404) return null
  if (!response.ok)
    throw new Error(`Reading last-run values answered ${response.status}`)
  return (await response.json()) as LastRun
}

export async function saveLastRun(id: WorkspaceId, run: LastRun): Promise<void> {
  const response = await fetch(`${base(id)}?hash=${run.sourceHash}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(run),
  })
  if (!response.ok)
    throw new Error(`Saving last-run values answered ${response.status}`)
}

type Listener = (run: LastRun) => void
const listeners = new Set<Listener>()

/** Tells open views (a code editor's margin, say) that a block ran. */
export function announceLastRun(run: LastRun): void {
  for (const listener of listeners) listener(run)
}

export function onLastRun(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
