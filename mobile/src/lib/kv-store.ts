// SOURCING: React useSyncExternalStore over the kv table (local-db.ts), the same shape as preferences.ts and library/pins.ts
//
// One device-local value in the kv table, readable as a hook. `parse` turns
// what is stored (or nothing) into the value; `serialize` returns undefined to
// clear the key. The value keeps its identity until the stored text changes,
// so a component that reads it does not render again for nothing.
import { useSyncExternalStore } from 'react'
import { kv } from './local-db'

export function kvStore<T>(key: string, parse: (raw: string | undefined) => T, serialize: (value: T) => string | undefined) {
  const listeners = new Set<() => void>()
  let cache: { raw: string | undefined; value: T } | undefined

  const get = (): T => {
    const raw = kv.get(key)
    if (cache && cache.raw === raw) return cache.value
    cache = { raw, value: parse(raw) }
    return cache.value
  }

  const set = (value: T) => {
    const raw = serialize(value)
    if (raw === undefined) kv.delete(key)
    else kv.set(key, raw)
    for (const listener of listeners) listener()
  }

  const use = () =>
    useSyncExternalStore((listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }, get)

  return { get, set, use }
}
