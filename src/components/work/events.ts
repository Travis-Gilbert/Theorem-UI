// SOURCING: @tanstack/react-query (the live stream applied to the query cache, through the WorkSource's subscribe); one subscription per source however many components ask
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { applyWorkEvent } from './cache'
import { useWorkSource } from './source'
import type { WorkSource } from './source'

type Shared = { users: number; stop: () => void }
const open = new WeakMap<QueryClient, Map<WorkSource, Shared>>()

/**
 * Subscribes once per client and source, and keeps the subscription while any
 * caller holds it. Returns the release.
 */
export function holdWorkEvents(
  client: QueryClient,
  source: WorkSource,
): () => void {
  let sources = open.get(client)
  if (!sources) open.set(client, (sources = new Map()))
  let shared = sources.get(source)
  if (!shared) {
    shared = {
      users: 0,
      stop: source.subscribe((signal) =>
        applyWorkEvent(client, source.id, signal),
      ),
    }
    sources.set(source, shared)
  }
  shared.users++
  const held = shared
  return () => {
    if (--held.users > 0) return
    held.stop()
    sources.delete(source)
  }
}

/** Keeps the work caches live while the caller is mounted; mount it only while the tracker is on. */
export function useWorkEvents() {
  const client = useQueryClient()
  const source = useWorkSource()
  useEffect(() => holdWorkEvents(client, source), [client, source])
}
