// SOURCING: async-mutex (workspaces open one at a time, so two folders that
// carry the same id, a copied folder, are told apart). Which workspaces are
// open follows the host's folder grants (grants.ts); a map from grant to open
// service is this app's own bookkeeping, hand-rolled.
import path from 'node:path'
import { Mutex } from 'async-mutex'
import type { FolderGrant } from '#/lib/desktop/bindings/FolderGrant'
import type { WorkspaceId, WorkspaceSummary } from '#/lib/workspace/types'
import { currentGrants, onGrantsChanged } from '../grants'
import { desktopDataDir } from '../mode'
import { WorkspaceError } from './errors'
import { newWorkspaceId, readWorkspaceId, writeWorkspaceId } from './identity'
import { WorkspaceService } from './service'
import type { ServiceOptions } from './service'

/** Options every workspace opens with. Tests set the trash and watcher timing. */
export const registryOptions: Pick<ServiceOptions, 'trash' | 'watch'> = {}

const open = new Map<string, WorkspaceService>()
const lock = new Mutex()
let following = false

/** The app data folder for a workspace's index and settings. */
export function workspaceDataDir(id: WorkspaceId): string {
  return path.join(desktopDataDir(), 'workspaces', id)
}

function follow() {
  if (following) return
  following = true
  onGrantsChanged((grants) => {
    applyGrants(grants).catch((error: unknown) => {
      console.error('[workspace] applying folder grants failed', error)
    })
  })
}

async function serviceFor(grant: FolderGrant): Promise<WorkspaceService> {
  return (
    open.get(grant.path) ??
    lock.runExclusive(async () => {
      const existing = open.get(grant.path)
      if (existing) return existing
      let id = await readWorkspaceId(grant.path)
      // A copy of a folder arrives with the original's id; it gets its own.
      if ([...open.values()].some((service) => service.id === id)) {
        id = newWorkspaceId()
        await writeWorkspaceId(grant.path, id)
      }
      const service = await WorkspaceService.open(grant.path, id, grant.name, {
        ...registryOptions,
        dataDir: workspaceDataDir(id),
      })
      if (!currentGrants().some((g) => g.path === grant.path)) {
        await service.close()
        throw new WorkspaceError(
          404,
          'workspace_not_found',
          `${grant.name} is no longer open`,
        )
      }
      open.set(grant.path, service)
      return service
    })
  )
}

/** Opens newly granted folders and closes the ones whose grant was withdrawn. */
async function applyGrants(grants: Array<FolderGrant>): Promise<void> {
  const granted = new Set(grants.map((grant) => grant.path))
  for (const [root, service] of open)
    if (!granted.has(root)) {
      open.delete(root)
      await service.close()
    }
  await Promise.allSettled(grants.map(serviceFor))
}

/** Every granted folder as a workspace, opening any not open yet. */
export async function listWorkspaces(): Promise<Array<WorkspaceSummary>> {
  follow()
  const grants = currentGrants()
  const results = await Promise.allSettled(grants.map(serviceFor))
  return results.flatMap((result, i) => {
    if (result.status === 'fulfilled') return [result.value.summary()]
    console.error(
      `[workspace] opening ${grants[i]!.path} failed`,
      result.reason,
    )
    return []
  })
}

/** The open workspace with this id, or a 404. */
export async function getWorkspace(id: string): Promise<WorkspaceService> {
  follow()
  const find = () => [...open.values()].find((service) => service.id === id)
  if (!find()) await listWorkspaces()
  const found = find()
  if (!found)
    throw new WorkspaceError(
      404,
      'workspace_not_found',
      `No open workspace has the id ${id}`,
    )
  return found
}

/** Closes every workspace. For tests and shutdown. */
export async function closeAllWorkspaces(): Promise<void> {
  const services = [...open.values()]
  open.clear()
  await Promise.all(services.map((service) => service.close()))
}
