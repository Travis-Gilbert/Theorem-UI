// SOURCING: @theoremharness/sdk spaces client (Theorem Spaces v1), @tanstack/react-query (space server state), zustand (save status)
//
// Each project has one Space, and a canvas placed on a Space is a Space of its
// own. The canvas edits one optimistically through small edits keyed by id. Saves PUT the whole
// record against the last confirmed revision; a stale revision reloads and
// replays the unsaved edits onto the newer record, which is the rebase.
import { useQuery } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { hasStatus, mutate, theorem } from './client'
import type { Theorem } from './client'

const SCHEMA = 'theorem.space/1'
const FORMAT = 1
const SAVE_DELAY_MS = 400
const REBASE_ATTEMPTS = 3

export type Placement = Theorem.SpacePlacement
export type Connection = Theorem.SpaceConnection
/** A placed Theorem document: a note card. */
export type NotePlacement = Theorem.SpacePlacement.Object

export const isNotePlacement = (p: Placement): p is NotePlacement =>
  p.target === 'object' && p.object.kind === 'document'
/** One change to a Space, replayable onto a newer revision. */
export type SpaceEdit = (space: Theorem.Space) => Theorem.Space

export const spaceIdFor = (projectId: string) => `space:project:${projectId}`
export const spaceKey = (spaceId: string) =>
  ['theorem', 'space', spaceId] as const

/** What a Space is when Theorem has not stored it yet. */
export type SpaceSeed =
  | { kind: 'project'; spaceId: string; projectId: string; title: string }
  | { kind: 'custom'; spaceId: string; parent?: string; title: string }

export const projectSeed = (projectId: string, title: string): SpaceSeed => ({
  kind: 'project',
  spaceId: spaceIdFor(projectId),
  projectId,
  title,
})

function emptySpace(seed: SpaceSeed): Theorem.SpaceRecord {
  const common = {
    format: FORMAT,
    id: seed.spaceId,
    title: seed.title,
    placements: [],
    connections: [],
  }
  return {
    schema: SCHEMA,
    revision: 0,
    space:
      seed.kind === 'project'
        ? {
            role: 'project',
            ...common,
            project: { kind: 'project', id: seed.projectId },
          }
        : {
            role: 'custom',
            ...common,
            ...(seed.parent ? { parent: seed.parent } : {}),
          },
  }
}

async function fetchSpace(seed: SpaceSeed): Promise<Theorem.SpaceRecord> {
  try {
    return await theorem().spaces.get({ spaceId: seed.spaceId })
  } catch (error) {
    if (hasStatus(error, 404)) return emptySpace(seed)
    throw error
  }
}

export type SpaceSaveStatus = 'saved' | 'pending' | 'saving' | 'error'

export const useSpaceStatus = create<{
  status: SpaceSaveStatus
  error: unknown
  set: (status: SpaceSaveStatus, error?: unknown) => void
}>()((set) => ({
  status: 'saved',
  error: undefined,
  set: (status, error) => set({ status, error }),
}))

type SpaceSync = {
  seed: SpaceSeed
  /** The last record the server confirmed. */
  confirmed: Theorem.SpaceRecord
  /** Edits not yet confirmed, oldest first. */
  pending: SpaceEdit[]
  timer?: ReturnType<typeof setTimeout>
  saving?: Promise<void>
}

const syncs = new Map<string, SpaceSync>()

const replay = (space: Theorem.Space, edits: readonly SpaceEdit[]) =>
  edits.reduce((next, edit) => edit(next), space)

async function flush(queryClient: QueryClient, spaceId: string) {
  const sync = syncs.get(spaceId)
  if (!sync || !sync.pending.length) return
  const edits = sync.pending.splice(0)
  useSpaceStatus.getState().set('saving')
  for (let attempt = 0; ; attempt++) {
    const { confirmed } = sync
    const body: Theorem.SpaceRecord = {
      ...confirmed,
      space: replay(confirmed.space, edits),
    }
    try {
      sync.confirmed = await mutate((headers) =>
        theorem().spaces.save({
          ...headers,
          spaceId,
          'If-Match': String(confirmed.revision),
          body,
        }),
      )
      break
    } catch (error) {
      if (hasStatus(error, 409, 412) && attempt + 1 < REBASE_ATTEMPTS) {
        sync.confirmed = await fetchSpace(sync.seed)
        continue
      }
      // Keep the edits so the next change retries them.
      sync.pending.unshift(...edits)
      useSpaceStatus.getState().set('error', error)
      return
    }
  }
  queryClient.setQueryData<Theorem.SpaceRecord>(spaceKey(spaceId), {
    ...sync.confirmed,
    space: replay(sync.confirmed.space, sync.pending),
  })
  useSpaceStatus.getState().set(sync.pending.length ? 'pending' : 'saved')
}

/** Apply an edit to the cached Space now and schedule its save. */
export function editSpace(
  queryClient: QueryClient,
  spaceId: string,
  edit: SpaceEdit,
) {
  const sync = syncs.get(spaceId)
  if (!sync) return
  queryClient.setQueryData<Theorem.SpaceRecord>(
    spaceKey(spaceId),
    (record) => record && { ...record, space: edit(record.space) },
  )
  sync.pending.push(edit)
  useSpaceStatus.getState().set('pending')
  clearTimeout(sync.timer)
  sync.timer = setTimeout(() => {
    sync.saving = (sync.saving ?? Promise.resolve()).then(() =>
      flush(queryClient, spaceId),
    )
  }, SAVE_DELAY_MS)
}

/** Resolves once every scheduled edit has been saved or has failed. */
export async function settleSpace(queryClient: QueryClient, spaceId: string) {
  const sync = syncs.get(spaceId)
  if (!sync) return
  clearTimeout(sync.timer)
  sync.saving = (sync.saving ?? Promise.resolve()).then(() =>
    flush(queryClient, spaceId),
  )
  await sync.saving
}

export function useSpaceRecord(seed: SpaceSeed) {
  const { spaceId } = seed
  return useQuery({
    queryKey: spaceKey(spaceId),
    queryFn: async () => {
      const confirmed = await fetchSpace(seed)
      const sync = syncs.get(spaceId)
      if (sync) {
        sync.confirmed = confirmed
        return { ...confirmed, space: replay(confirmed.space, sync.pending) }
      }
      syncs.set(spaceId, { seed, confirmed, pending: [] })
      return confirmed
    },
    // The canvas edits this entry optimistically; a refetch replays pending edits.
    staleTime: 30_000,
  })
}

export const useSpace = (projectId: string, title: string) =>
  useSpaceRecord(projectSeed(projectId, title))

/**
 * A new canvas inside another. It is stored at once, so its title exists
 * wherever it is shown, whatever happens to the placement that points at it.
 */
export async function createChildSpace(
  queryClient: QueryClient,
  parent: string,
  title: string,
) {
  const seed: SpaceSeed = {
    kind: 'custom',
    spaceId: `space:canvas:${crypto.randomUUID()}`,
    parent,
    title,
  }
  const confirmed = await mutate((headers) =>
    theorem().spaces.save({
      ...headers,
      spaceId: seed.spaceId,
      'If-Match': '0',
      body: emptySpace(seed),
    }),
  )
  syncs.set(seed.spaceId, { seed, confirmed, pending: [] })
  queryClient.setQueryData(spaceKey(seed.spaceId), confirmed)
  return seed.spaceId
}

// Edits, each keyed by id so a replay onto a newer revision lands on the same object.

export const upsertPlacement =
  (placement: Placement): SpaceEdit =>
  (space) => ({
    ...space,
    placements: [
      ...(space.placements ?? []).filter((p) => p.id !== placement.id),
      placement,
    ],
  })

export const movePlacement =
  (id: string, rect: Theorem.SpaceRect): SpaceEdit =>
  (space) => ({
    ...space,
    placements: (space.placements ?? []).map((p) =>
      p.id === id ? { ...p, rect } : p,
    ),
  })

/** Removes placements and every connection that touches them. */
export const removePlacements =
  (ids: ReadonlySet<string>): SpaceEdit =>
  (space) => ({
    ...space,
    placements: (space.placements ?? []).filter((p) => !ids.has(p.id)),
    connections: (space.connections ?? []).filter(
      (c) => !ids.has(c.from) && !ids.has(c.to),
    ),
  })

export const upsertConnection =
  (connection: Connection): SpaceEdit =>
  (space) => {
    const ids = new Set((space.placements ?? []).map((p) => p.id))
    // A replay onto a revision that dropped an endpoint drops the connection too.
    if (!ids.has(connection.from) || !ids.has(connection.to)) return space
    return {
      ...space,
      connections: [
        ...(space.connections ?? []).filter((c) => c.id !== connection.id),
        connection,
      ],
    }
  }

export const removeConnections =
  (ids: ReadonlySet<string>): SpaceEdit =>
  (space) => ({
    ...space,
    connections: (space.connections ?? []).filter((c) => !ids.has(c.id)),
  })

/** Placements keep their position on the canvas, so a group's move carries them along. */
export const moveGroup =
  (id: string, rect: Theorem.SpaceRect): SpaceEdit =>
  (space) => {
    const group = space.groups?.find((g) => g.id === id)
    if (!group) return space
    const dx = rect.x - group.rect.x
    const dy = rect.y - group.rect.y
    return {
      ...space,
      groups: space.groups?.map((g) => (g.id === id ? { ...g, rect } : g)),
      placements: (space.placements ?? []).map((p) =>
        p.group === id
          ? { ...p, rect: { ...p.rect, x: p.rect.x + dx, y: p.rect.y + dy } }
          : p,
      ),
    }
  }

/** Resizing a group leaves what is in it where it is. */
export const resizeGroup =
  (id: string, rect: Theorem.SpaceRect): SpaceEdit =>
  (space) => ({
    ...space,
    groups: space.groups?.map((g) => (g.id === id ? { ...g, rect } : g)),
  })

export const upsertGroup =
  (group: Theorem.SpaceGroup): SpaceEdit =>
  (space) => ({
    ...space,
    groups: [...(space.groups ?? []).filter((g) => g.id !== group.id), group],
  })

/** Removes groups; what they held stays on the canvas. */
export const removeGroups =
  (ids: ReadonlySet<string>): SpaceEdit =>
  (space) => ({
    ...space,
    groups: (space.groups ?? []).filter((g) => !ids.has(g.id)),
    placements: (space.placements ?? []).map((p) => {
      if (!p.group || !ids.has(p.group)) return p
      const { group: _group, ...rest } = p
      return rest
    }),
  })

export const setPlacementGroup =
  (id: string, group: string | undefined): SpaceEdit =>
  (space) => ({
    ...space,
    placements: (space.placements ?? []).map((p) => {
      if (p.id !== id) return p
      const { group: _group, ...rest } = p
      return group ? { ...rest, group } : rest
    }),
  })

export const renameSpace =
  (title: string): SpaceEdit =>
  (space) => ({ ...space, title })

export const userAuthorship: Theorem.PlacementAuthorship = {
  placed_by: { actor: 'user' },
  arranged: false,
}
