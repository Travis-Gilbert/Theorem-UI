// SOURCING: zustand (already the frontend's store) holds what the host knows and the UI shows:
// the live stream's state and, per open document, the session's revision, pending and dirty
// flags and any unresolved conflict. Nothing here is authoritative; the SDK session is.

import { create } from 'zustand'
import type { WorkspaceLiveState } from '@theoremharness/sdk'
import type { Refusal } from './host'
import type { SessionSyncState } from './session-sync'

export interface DocConflict {
  /** Authority revision the conflict was reported at. */
  revision: number
  /** The checkout's file is gone, not just different. */
  diskDeleted: boolean
  /** Keep the shared text (`authority`: saving will write it) or adopt the checkout (`disk`). */
  resolve(keep: 'authority' | 'disk'): Promise<void>
}

export interface HostState {
  live: WorkspaceLiveState | 'idle'
  /** Resyncs seen on this page, by reason. */
  resyncs: string[]
  /** Last live cursor the connection saved. */
  cursor: string | undefined
  docs: Record<string, SessionSyncState>
  conflicts: Record<string, DocConflict>
  /** What the host has refused on this page (commands and platform features), by key. */
  unavailable: Record<string, Refusal>
}

export const useHostState = create<HostState>(() => ({
  live: 'idle',
  resyncs: [],
  cursor: undefined,
  docs: {},
  conflicts: {},
  unavailable: {},
}))

export const hostState = {
  setLive: (live: HostState['live']) => useHostState.setState({ live }),
  addResync: (reason: string) => useHostState.setState((s) => ({ resyncs: [...s.resyncs, reason] })),
  setCursor: (cursor: string | undefined) => useHostState.setState({ cursor }),
  setRefusal: (feature: string, refusal: Refusal) =>
    useHostState.setState((s) => ({ unavailable: { ...s.unavailable, [feature]: refusal } })),
  setDoc: (path: string, state: SessionSyncState) =>
    useHostState.setState((s) => ({ docs: { ...s.docs, [path]: state } })),
  clearDoc: (path: string) =>
    useHostState.setState((s) => {
      const docs = { ...s.docs }
      const conflicts = { ...s.conflicts }
      delete docs[path]
      delete conflicts[path]
      return { docs, conflicts }
    }),
  setConflict: (path: string, conflict: DocConflict) =>
    useHostState.setState((s) => ({ conflicts: { ...s.conflicts, [path]: conflict } })),
  clearConflict: (path: string) =>
    useHostState.setState((s) => {
      if (!(path in s.conflicts)) return s
      const conflicts = { ...s.conflicts }
      delete conflicts[path]
      return { conflicts }
    }),
}
