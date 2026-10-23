// SOURCING: React's useSyncExternalStore (a session's blocks and a block's
// state as hooks over the session's own subscriptions). The sessions are
// shared and counted so every view of one file sees one graph, and closed
// after a grace period the way React Query collects queries; the defaults
// bind the compile worker and store (compiler.ts), the formula worker
// (formulas/worker-client.ts) and the workspace's Loro state (state.ts).
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { WorkspaceClient } from '@/lib/workspace/types'
import { cachedCompiler, compileInWorker } from './compiler'
import { formulaEngine } from './formulas/worker-client'
import type { CellState } from './runtime'
import { BlockSession } from './session'
import type { BlockSessionOptions, SessionBlock } from './session'
import { workspaceState } from './state'

type Kind = BlockSessionOptions['kind']

const sessions = new Map<string, { session: BlockSession; users: number }>()
/** Each session's registry id: its path can change under it (a rename). */
const ids = new WeakMap<BlockSession, string>()
const sessionId = (client: WorkspaceClient, path: string, kind: Kind) =>
  `${client.workspace.id}\n${kind}\n${path}`

/**
 * How long a session nobody holds stays open: a view that remounts (a tab
 * switched back, React's strict-mode double effects, a render that never
 * committed) finds its graph still warm. React Query's gcTime, smaller.
 */
const SESSION_GC_MS = 10_000

function defaults(
  client: WorkspaceClient,
): Pick<BlockSessionOptions, 'compile' | 'engine' | 'state'> {
  const id = client.workspace.id
  const compile = cachedCompiler(id, async (source) =>
    (await compileInWorker())(source),
  )
  return { compile, engine: formulaEngine(), state: workspaceState(id) }
}

function collectLater(id: string) {
  setTimeout(() => {
    const entry = sessions.get(id)
    if (!entry || entry.users > 0) return
    entry.session.dispose()
    sessions.delete(id)
  }, SESSION_GC_MS)
}

/**
 * The shared session for a file's live blocks (a note's, or a tool file's one
 * block), opened on first use. Safe during render, like React Query's cache:
 * a session nobody retains closes after a short while.
 */
export function blockSessionFor(
  client: WorkspaceClient,
  path: string,
  kind: Kind,
): BlockSession {
  const id = sessionId(client, path, kind)
  let entry = sessions.get(id)
  if (!entry) {
    const session = new BlockSession({
      client,
      path,
      kind,
      ...defaults(client),
    })
    void session.load().catch((error: unknown) => {
      console.error('[blocks] reading', path, 'failed', error)
    })
    entry = { session, users: 0 }
    sessions.set(id, entry)
    ids.set(session, id)
    collectLater(id)
  }
  return entry.session
}

/** Holds a session open until the returned release is called. */
export function retainBlockSession(session: BlockSession): () => void {
  const id = ids.get(session)
  const entry = id === undefined ? undefined : sessions.get(id)
  if (id === undefined || entry?.session !== session) return () => {}
  entry.users++
  let released = false
  return () => {
    if (released) return
    released = true
    if (--entry.users === 0) collectLater(id)
  }
}

/** Opens and holds a session: what code outside React uses. */
export function acquireBlockSession(
  client: WorkspaceClient,
  path: string,
  kind: Kind,
): { session: BlockSession; release: () => void } {
  const session = blockSessionFor(client, path, kind)
  return { session, release: retainBlockSession(session) }
}

/** Every open session of a workspace: trust changes reach them all. */
export function sessionsOf(client: WorkspaceClient): Array<BlockSession> {
  return [...sessions.values()]
    .map((entry) => entry.session)
    .filter((session) => session.client.workspace.id === client.workspace.id)
}

/** The session for a file, held while the component is mounted. */
export function useBlockSession(
  client: WorkspaceClient,
  path: string,
  kind: Kind,
): BlockSession {
  const session = useMemo(
    () => blockSessionFor(client, path, kind),
    [client, path, kind],
  )
  useEffect(() => retainBlockSession(session), [session])
  return session
}

/** The session's blocks, re-read whenever they change. */
export function useSessionBlocks(session: BlockSession | null): {
  blocks: Array<SessionBlock>
  version: number
} {
  const subscribe = useCallback(
    (listener: () => void) => session?.subscribe(listener) ?? (() => {}),
    [session],
  )
  const version = useSyncExternalStore(
    subscribe,
    () => session?.getVersion() ?? -1,
    () => -1,
  )
  return { blocks: session?.list() ?? [], version }
}

/**
 * A block's state in the graph, or null while it has none (an untrusted
 * folder, or a block not defined yet).
 */
export function useCellState(
  session: BlockSession | null,
  key: string,
): CellState | null {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!session) return () => {}
      let stopCell = () => {}
      const follow = () => {
        stopCell()
        stopCell = session.cell(key)?.subscribe(listener) ?? (() => {})
      }
      follow()
      const stopSession = session.subscribe(() => {
        follow()
        listener()
      })
      return () => {
        stopSession()
        stopCell()
      }
    },
    [session, key],
  )
  return useSyncExternalStore(
    subscribe,
    () => session?.cell(key)?.getState() ?? null,
    () => null,
  )
}
