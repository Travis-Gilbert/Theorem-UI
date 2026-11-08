// SOURCING: React useSyncExternalStore; the theorem-session computers() API; discoveryScript / parseDiscovery / conversationsOf
//
// The computers saved on this device and the agent conversations each one
// has, shared by the conversation list, the recipient picker and Settings.
// Each computer is checked on its own, so one that is off or asleep does not
// hide the others.
import { useSyncExternalStore } from 'react'
import { computers, type Computer } from '../../../modules/theorem-session'
import { conversationsOf, parseDiscovery, type AgentConversation } from './discovery'
import { runnerFor } from './remote'
import { discoveryScript } from './shell'

export type ComputerEntry = {
  computer: Computer
  status: 'loading' | 'ready' | 'failed'
  conversations: AgentConversation[]
  /** False when the computer has no tmux: conversations can be read, not started or continued. */
  tmux: boolean
  error?: unknown
}

export type ComputersSnapshot =
  | { status: 'unavailable' }
  | { status: 'loading'; entries: ComputerEntry[] }
  | { status: 'ready'; entries: ComputerEntry[] }
  | { status: 'failed'; error: unknown; entries: ComputerEntry[] }

let snapshot: ComputersSnapshot = computers() ? { status: 'loading', entries: [] } : { status: 'unavailable' }
let generation = 0
let started = false
const listeners = new Set<() => void>()

function publish(next: ComputersSnapshot) {
  snapshot = next
  for (const listener of listeners) listener()
}

function updateEntry(id: string, change: Partial<ComputerEntry>) {
  if (snapshot.status === 'unavailable') return
  publish({
    ...snapshot,
    entries: snapshot.entries.map((entry) => (entry.computer.id === id ? { ...entry, ...change } : entry)),
  })
}

/** Lists the saved computers again and asks each what it is running. */
export async function refreshComputers(): Promise<void> {
  started = true
  const api = computers()
  if (!api) return publish({ status: 'unavailable' })
  const current = ++generation
  const previous = snapshot.status === 'unavailable' ? [] : snapshot.entries
  publish({ status: 'loading', entries: previous })
  let list: Computer[]
  try {
    list = await api.list()
  } catch (error) {
    if (current === generation) publish({ status: 'failed', error, entries: previous })
    return
  }
  if (current !== generation) return
  publish({
    status: 'ready',
    entries: list.map((computer) => {
      const known = previous.find((entry) => entry.computer.id === computer.id)
      return {
        computer,
        status: 'loading',
        conversations: known?.conversations ?? [],
        tmux: known?.tmux ?? true,
      }
    }),
  })
  await Promise.all(
    list.map(async (computer) => {
      try {
        const discovery = parseDiscovery(await runnerFor(computer.id)(discoveryScript()))
        if (!discovery) throw new Error('The computer did not run the check.')
        if (current === generation)
          updateEntry(computer.id, {
            status: 'ready',
            conversations: conversationsOf(computer.id, discovery),
            tmux: discovery.tmux,
            error: undefined,
          })
      } catch (error) {
        if (current === generation) updateEntry(computer.id, { status: 'failed', error })
      }
    }),
  )
}

export function useComputers(): ComputersSnapshot {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      if (!started) void refreshComputers()
      return () => listeners.delete(listener)
    },
    () => snapshot,
  )
}

export function computerById(id: string): Computer | undefined {
  return snapshot.status === 'unavailable' ? undefined : snapshot.entries.find((e) => e.computer.id === id)?.computer
}
