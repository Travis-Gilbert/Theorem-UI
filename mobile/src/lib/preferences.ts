// SOURCING: React useSyncExternalStore over the kv table (local-db.ts)
//
// Device preferences the person sets in Settings. Show terminal is off by
// default: conversations with Claude Code and Codex are chat, and the terminal
// behind them stays out of sight unless the person asks for it.
import { useSyncExternalStore } from 'react'
import { kv } from './local-db'

const SHOW_TERMINAL = 'preference.show-terminal'
const listeners = new Set<() => void>()

const read = () => kv.get(SHOW_TERMINAL) === 'on'

export function setShowTerminal(on: boolean) {
  if (on) kv.set(SHOW_TERMINAL, 'on')
  else kv.delete(SHOW_TERMINAL)
  for (const listener of listeners) listener()
}

export function useShowTerminal(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    read,
  )
}
