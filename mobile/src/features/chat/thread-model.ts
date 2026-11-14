// SOURCING: none. What a Theorem thread says about itself, as lines of a list row; no network, no React.
import type { Theorem } from '@theoremharness/sdk'

export function threadTitle(thread: Theorem.Thread): string {
  return thread.title.trim() || 'New conversation'
}

/** When the conversation last moved: its last message, else its last change. */
export const threadActivityMs = (thread: Theorem.Thread) => thread.lastMessageAtMs ?? thread.updatedAtMs

/** The conversation to resume: the most recently active one that is neither archived nor deleted. */
export function mostRecentThread(threads: readonly Theorem.Thread[]): Theorem.Thread | undefined {
  let best: Theorem.Thread | undefined
  for (const thread of threads) {
    if (thread.status !== 'regular' || thread.deletedAtMs) continue
    if (!best || threadActivityMs(thread) > threadActivityMs(best)) best = thread
  }
  return best
}

export type ThreadState = { symbol: string; label: string; tone: 'muted' | 'accent' | 'error' }

/**
 * What the thread says about its run, and nothing it does not: a run in
 * progress, a turn waiting to start, or how the last run ended. A thread with
 * no messages says so; one with messages but no recorded run says nothing.
 */
export function threadState(thread: Theorem.Thread): ThreadState | undefined {
  if (thread.activeRunId) return { symbol: '●', label: 'Working', tone: 'accent' }
  if (thread.pendingTurn) return { symbol: '●', label: 'Waiting to start', tone: 'accent' }
  switch (thread.lastRun?.outcome) {
    case 'completed':
      return { symbol: '✓', label: 'Finished', tone: 'muted' }
    case 'failed':
      return { symbol: '×', label: 'Failed', tone: 'error' }
    case 'stopped':
      return { symbol: '○', label: 'Stopped', tone: 'muted' }
    case 'ended':
      return { symbol: '○', label: 'Ended', tone: 'muted' }
  }
  if (thread.lastMessageAtMs === undefined) return { symbol: '○', label: 'No messages yet', tone: 'muted' }
  return undefined
}

/** The lines of a long-press details sheet: the full time and the identifier live here, not in the row. */
export function threadDetails(thread: Theorem.Thread, project?: string): string {
  const stamp = (ms: number) =>
    new Date(ms).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
  const state = threadState(thread)
  return [
    project ? `Project: ${project}` : undefined,
    state ? `State: ${state.label}` : undefined,
    thread.lastMessageAtMs ? `Last message: ${stamp(thread.lastMessageAtMs)}` : undefined,
    `Started: ${stamp(thread.createdAtMs)}`,
    `Updated: ${stamp(thread.updatedAtMs)}`,
    `Thread: ${thread.threadId}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** One line of state and time, for pickers that list threads as a single detail (the intake receiver). */
export function threadDetail(thread: Theorem.Thread): string {
  const when = new Date(thread.lastMessageAtMs ?? thread.updatedAtMs)
  const live = thread.activeRunId ? 'Run in progress · ' : ''
  return `${live}${when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
}

/** Threads whose title contains `query`, ignoring case, in the order given. Search runs over titles only. */
export function matchThreads(threads: readonly Theorem.Thread[], query: string): Theorem.Thread[] {
  const needle = query.trim().toLowerCase()
  return needle ? threads.filter((thread) => threadTitle(thread).toLowerCase().includes(needle)) : []
}
