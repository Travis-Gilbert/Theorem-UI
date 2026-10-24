// SOURCING: DOMPurify (a snapshot is HTML a block produced, so it is
// sanitized before the page keeps it) and React's useSyncExternalStore. Shown
// in a frame with no scripts under a policy that loads nothing (plan D13:
// "live at high zoom, snapshot below").
import DOMPurify from 'dompurify'
import { useCallback, useSyncExternalStore } from 'react'
import type { WorkspaceId } from '@/lib/workspace/types'

/** Snapshots kept at once; the oldest goes first. */
const MAX_SNAPSHOTS = 64

/**
 * Below this zoom a canvas card shows a frame's snapshot instead of running
 * it. Phase 3 renders embeds at 0.5, so an embedded tool or app always runs.
 */
export const LIVE_ZOOM = 0.4

const snapshots = new Map<string, string>()
const listeners = new Set<() => void>()

export const snapshotKey = (id: WorkspaceId, path: string) => `${id}\n${path}`

const POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"

/**
 * A snapshot as a frame document: sanitized, and allowed to load nothing.
 * `purify` is DOMPurify bound to another window, for tests.
 */
export function snapshotDocument(
  html: string,
  purify: Pick<typeof DOMPurify, 'sanitize'> = DOMPurify,
): string {
  // FORCE_BODY keeps the style elements a snapshot starts with.
  const clean = purify.sanitize(html, { FORCE_BODY: true })
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLICY}"></head><body>${clean}</body></html>`
}

/** Keeps the latest snapshot a frame sent for a file. */
export function saveSnapshot(key: string, html: string): void {
  snapshots.delete(key)
  snapshots.set(key, snapshotDocument(html))
  for (const old of [...snapshots.keys()].slice(0, -MAX_SNAPSHOTS))
    snapshots.delete(old)
  for (const listener of listeners) listener()
}

/** The latest snapshot document for a file, or null. */
export function useSnapshot(key: string): string | null {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => snapshots.get(key) ?? null,
    () => null,
  )
}
