// SOURCING: hand-rolled. The server's copy of the host's folder grants, kept
// current by the control channel; a few lines of state with no library to bind.
import path from 'node:path'
import type { FolderGrant } from '#/lib/desktop/bindings/FolderGrant'

let grants: Array<FolderGrant> = []
const listeners = new Set<(next: Array<FolderGrant>) => void>()

/** Replace the grants. Called when the host sends `hello` or `grants`. */
export function setGrants(next: Array<FolderGrant>): void {
  grants = next
  for (const listener of listeners) listener(grants)
}

/** The folders the person opened through the system picker. */
export function currentGrants(): Array<FolderGrant> {
  return grants
}

/** The grant whose folder contains `absolutePath`, if any. */
export function grantFor(absolutePath: string): FolderGrant | undefined {
  const target = path.resolve(absolutePath)
  return grants.find((grant) => {
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
  listeners.add(listener)
  return () => listeners.delete(listener)
}
