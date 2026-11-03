// SOURCING: the WorkspaceClient's setTrusted (the local server keeps trust in
// app data, plan D9), @tanstack/react-query's client from context when there
// is one (the folder list refetched so every view sees the change) and
// React's useSyncExternalStore. A folder's blocks run only once it is trusted.
import { QueryClientContext } from '@tanstack/react-query'
import { useContext, useState, useSyncExternalStore } from 'react'
import { THEOREM_VAULT_KEY, WORKSPACES_KEY } from '@/lib/workspace/workspaces'
import type { WorkspaceClient } from '@/lib/workspace/types'
import { sessionsOf } from './sessions'

const listeners = new Set<() => void>()
let changes = 0

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Trusts (or stops trusting) a folder, and tells its open blocks. */
export async function setFolderTrust(
  client: WorkspaceClient,
  trusted: boolean,
): Promise<void> {
  await client.setTrusted(trusted)
  for (const session of sessionsOf(client)) session.refreshTrust()
  changes++
  for (const listener of listeners) listener()
}

/** Whether the folder is trusted, and the action that trusts it. */
export function useFolderTrust(client: WorkspaceClient) {
  useSyncExternalStore(
    subscribe,
    () => changes,
    () => changes,
  )
  // Optional: block views also render outside the app's providers.
  const queryClient = useContext(QueryClientContext)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trust = async () => {
    setPending(true)
    setError(null)
    try {
      await setFolderTrust(client, true)
      await Promise.all([
        queryClient?.invalidateQueries({ queryKey: WORKSPACES_KEY }),
        queryClient?.invalidateQueries({ queryKey: THEOREM_VAULT_KEY }),
      ])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(false)
    }
  }
  return { trusted: client.workspace.trusted, trust, pending, error }
}
