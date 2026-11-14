// SOURCING: React useSyncExternalStore over the kv table (local-db.ts), the same shape as preferences.ts
//
// Pins are on this device only: the Files API has no pin concept, so the
// Library says "Pinned on this device" and does not claim they sync.
import { useSyncExternalStore } from 'react'
import { kv } from '@/lib/local-db'
import { togglePath } from './model'

const KEY = 'library.pins'
const listeners = new Set<() => void>()
let cache: { raw: string | undefined; paths: string[] } | undefined

function read(): string[] {
  const raw = kv.get(KEY)
  if (cache && cache.raw === raw) return cache.paths
  let paths: string[] = []
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) paths = parsed.filter((path): path is string => typeof path === 'string')
  } catch {
    paths = []
  }
  cache = { raw, paths }
  return paths
}

export function togglePin(path: string) {
  const next = togglePath(read(), path)
  if (next.length) kv.set(KEY, JSON.stringify(next))
  else kv.delete(KEY)
  for (const listener of listeners) listener()
}

export function usePins(): string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    read,
  )
}
