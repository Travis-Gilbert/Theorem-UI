// SOURCING: hand-rolled. The server's copy of the host's folder grants, kept
// current by the control channel; a few lines of state with no library to bind.
import path from 'node:path'
import type { FolderGrant } from '#/lib/desktop/bindings/FolderGrant'

interface GrantStore {
  grants: Array<FolderGrant>
  listeners: Set<(next: Array<FolderGrant>) => void>
}

// The production build bundles Nitro's plugins and routes apart from TanStack
// Start's server routes (`.output/server/_ssr`), so this module can load twice
// in one process. Both copies share one store on globalThis: the control
// channel writes it from the Nitro side, workspace routes read it from either.
const storeKey: unique symbol = Symbol.for('theorem.desktop.grants')
const scope = globalThis as { [storeKey]?: GrantStore }
const store = (scope[storeKey] ??= { grants: [], listeners: new Set() })

/** Replace the grants. Called when the host sends `hello` or `grants`. */
export function setGrants(next: Array<FolderGrant>): void {
  store.grants = next
  for (const listener of store.listeners) listener(store.grants)
}

/** The folders the person opened through the system picker. */
export function currentGrants(): Array<FolderGrant> {
  return store.grants
}

/** The grant whose folder contains `absolutePath`, if any. */
export function grantFor(absolutePath: string): FolderGrant | undefined {
  const target = path.resolve(absolutePath)
  return store.grants.find((grant) => {
    const relative = path.relative(grant.path, target)
    return (
      relative === '' ||
      (!relative.startsWith('..') && !path.isAbsolute(relative))
    )
  })
}

export function onGrantsChanged(
  listener: (next: Array<FolderGrant>) => void,
): () => void {
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
}
