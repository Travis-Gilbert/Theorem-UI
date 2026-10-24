// SOURCING: @theoremharness/sdk files client (Theorem Files API 1.0, adopted
// as-is) behind the same-origin proxy, with the app's mutate() for CSRF and
// idempotency. A thin adapter that implements WorkspaceClient over the
// Theorem vault; Theorem models the vault (placement, merges, the link
// index), nothing here does. The event log is a long poll, so the loop below
// is the whole transport.
import { TheoremError } from '@theoremharness/sdk'
import { fromBase64, toBase64 } from '@/lib/blocks/state'
import { mutate, theorem } from '@/lib/theorem/client'
import type { MutationHeaders, Theorem } from '@/lib/theorem/client'
import { WorkspaceRequestError } from './desktop-client'
import { WorkspaceConflictError } from './types'
import type {
  ChangeOrigin,
  WorkspaceClient,
  WorkspaceEntry,
  WorkspaceEvent,
  WorkspaceLink,
  WorkspaceSummary,
} from './types'

const SCHEMA = 'theorem-files/1'
/** Marks the Theorem vault among the workspaces. */
export const THEOREM_WORKSPACE_PREFIX = 'theorem:'
/** How long one events request waits for news; the API's limit. */
const WAIT_MS = 25_000
/** Waits before reconnecting after the event log fails, in turn. */
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000]

export const isTheoremWorkspace = (summary: WorkspaceSummary) =>
  summary.id.startsWith(THEOREM_WORKSPACE_PREFIX)

let clientId: string | undefined
/** This page's id, echoed on the events its own changes cause. */
const ownClientId = () => (clientId ??= crypto.randomUUID())

/** A Files API refusal as the workspace errors views already handle. */
function failure(error: unknown, path = ''): unknown {
  if (!(error instanceof TheoremError) || error.statusCode === undefined)
    return error
  const problem = (error.body ?? {}) as Partial<Theorem.FilesProblem>
  if (error.statusCode === 412)
    return new WorkspaceConflictError(
      problem.path ?? path,
      problem.currentHash ?? null,
    )
  return new WorkspaceRequestError(
    error.statusCode,
    problem.code ?? 'request_failed',
    problem.detail ?? problem.title ?? error.message,
  )
}

async function call<T>(run: () => Promise<T>, path?: string): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw failure(error, path)
  }
}

type ChangeHeaders = MutationHeaders & { 'X-Theorem-Client-Id': string }

/** One mutation, tagged with this page's id. */
const change = <T>(
  run: (headers: ChangeHeaders) => Promise<T>,
  path?: string,
) =>
  call(
    () =>
      mutate((headers) =>
        run({ ...headers, 'X-Theorem-Client-Id': ownClientId() }),
      ),
    path,
  )

function toEntry(entry: Theorem.FilesEntry): WorkspaceEntry {
  return {
    id: entry.entryId,
    path: entry.path,
    kind: entry.kind,
    size: entry.size,
    mtimeMs: entry.mtimeMs,
    theorem: {
      backing: entry.backing,
      readOnly: entry.readOnly,
      placed: entry.placed,
      documentId: entry.document?.documentId,
      documentKind: entry.document?.documentKind,
      agent: entry.document?.origin.kind === 'agent_encoded',
      planId: entry.plan?.planId,
      planStatus: entry.plan?.status,
    },
  }
}

function toEvent(event: Theorem.FilesEvent): WorkspaceEvent {
  const origin: ChangeOrigin =
    event.clientId === ownClientId() ? 'app' : 'external'
  switch (event.type) {
    case 'created':
      return { type: 'created', entry: toEntry(event.entry), origin }
    case 'changed':
      return {
        type: 'changed',
        entry: toEntry(event.entry),
        hash: event.contentHash,
        origin,
      }
    case 'deleted':
      return { type: 'deleted', id: event.entryId, path: event.path, origin }
    case 'renamed':
      return {
        type: 'renamed',
        id: event.entryId,
        from: event.from,
        to: event.to,
        origin,
      }
  }
}

const toLink = (link: Theorem.FilesLink): WorkspaceLink => ({
  from: link.from,
  target: link.target,
  resolved: link.resolved ?? null,
  kind: link.kind,
  heading: link.heading,
  block: link.block,
  line: link.line,
  receiptId: link.receiptId,
})

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })

/**
 * The person's Theorem vault, or null when there is none to show: nobody is
 * signed in, the backend is unconfigured, or it does not serve the Files API.
 */
export async function getTheoremVault(): Promise<WorkspaceSummary | null> {
  try {
    const vault = await theorem().files.vault({ schema: SCHEMA })
    return {
      id: `${THEOREM_WORKSPACE_PREFIX}${vault.vaultId}`,
      name: vault.name,
      path: '',
      trusted: vault.trusted,
      policy: 'ConnectedLive',
    }
  } catch (error) {
    if (error instanceof TheoremError && error.statusCode !== undefined)
      return null
    throw error
  }
}

/** A `WorkspaceClient` over the Theorem Files API. */
export function createTheoremWorkspaceClient(
  workspace: WorkspaceSummary,
): WorkspaceClient {
  const files = () => theorem().files
  let current = workspace

  // One event loop per client, running while anyone listens.
  const listeners = new Set<(event: WorkspaceEvent) => void>()
  let stop: AbortController | null = null
  const dispatch = (event: WorkspaceEvent) => {
    for (const listener of listeners) listener(event)
  }

  async function follow(signal: AbortSignal) {
    // A call, so the check is not narrowed away across the awaits.
    const stopped = () => signal.aborted
    let position: number | null = null
    let failures = 0
    while (!stopped()) {
      try {
        if (position === null) {
          ;({ position } = await files().vault(
            { schema: SCHEMA },
            { abortSignal: signal },
          ))
          // Whatever changed before the loop started, or while it was down,
          // was not seen; a view that fetched in that gap refetches.
          dispatch({ type: 'resync' })
        }
        const page: Theorem.FilesEventPage = await files().events(
          { schema: SCHEMA, after: position, waitMs: WAIT_MS },
          { abortSignal: signal },
        )
        failures = 0
        position = page.position
        if (page.resync) dispatch({ type: 'resync' })
        else if (page.events.length) {
          for (const event of page.events) dispatch(toEvent(event))
          // Theorem indexes a change before it logs it.
          dispatch({ type: 'indexed' })
        }
      } catch {
        if (stopped()) return
        position = null
        const wait = RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)]
        await sleep(wait ?? WAIT_MS, signal)
      }
    }
  }

  async function read(path: string) {
    const content = await call(() => files().read({ schema: SCHEMA, path }))
    return { content, hash: content.contentHash }
  }

  return {
    get workspace() {
      return current
    },
    async tree() {
      const page = await call(() => files().entries({ schema: SCHEMA }))
      return page.entries.map(toEntry)
    },
    async read(path) {
      const { content, hash } = await read(path)
      const bytes =
        content.encoding === 'utf8'
          ? new TextEncoder().encode(content.data)
          : fromBase64(content.data)
      return { bytes, hash }
    },
    async readText(path) {
      const { content, hash } = await read(path)
      const text =
        content.encoding === 'utf8'
          ? content.data
          : new TextDecoder().decode(fromBase64(content.data))
      return { text, hash }
    },
    async write(path, data, { expectedHash } = {}) {
      const receipt = await change(
        (headers) =>
          files().write({
            ...headers,
            ...(typeof expectedHash === 'string' && {
              'If-Match': expectedHash,
            }),
            ...(expectedHash === null && { 'If-None-Match': '*' }),
            schema: SCHEMA,
            path,
            ...(typeof data === 'string'
              ? { encoding: 'utf8', data }
              : { encoding: 'base64', data: toBase64(data) }),
          }),
        path,
      )
      return { hash: receipt.contentHash, merged: receipt.merged }
    },
    async mkdir(path) {
      await change((headers) =>
        files().mkdir({ ...headers, schema: SCHEMA, path }),
      )
    },
    async rename(from, to) {
      await change((headers) =>
        files().move({ ...headers, schema: SCHEMA, from, to }),
      )
    },
    async remove(path) {
      await change((headers) =>
        files().remove({ ...headers, schema: SCHEMA, path }),
      )
    },
    async resolve(target, fromPath) {
      const resolution = await call(() =>
        files().resolve({ schema: SCHEMA, target, from: fromPath }),
      )
      return resolution.path ?? null
    },
    async links(path) {
      const page = await call(() => files().links({ schema: SCHEMA, path }))
      return page.links.map(toLink)
    },
    async backlinks(path) {
      const page = await call(() => files().backlinks({ schema: SCHEMA, path }))
      return page.links.map(toLink)
    },
    async graph() {
      const graph = await call(() => files().graph({ schema: SCHEMA }))
      return {
        notes: graph.notes.map((note) => ({
          path: note.path,
          title: note.title,
          tags: note.tags,
          theorem: {
            backing: note.backing,
            documentKind: note.documentKind,
            agent: note.agent,
          },
        })),
        links: graph.links.map((link) => ({
          from: link.from,
          to: link.to ?? null,
          target: link.target,
          kind: link.kind,
        })),
      }
    },
    async search(query, { limit } = {}) {
      const page = await call(() =>
        files().search({ schema: SCHEMA, query, limit }),
      )
      return page.hits
    },
    async tags() {
      return (await call(() => files().tags({ schema: SCHEMA }))).tags
    },
    async properties(path) {
      const page = await call(() =>
        files().properties({ schema: SCHEMA, path }),
      )
      return page.properties
    },
    async settings() {
      const { attachments, dailyNotes } = await call(() =>
        files().settings({ schema: SCHEMA }),
      )
      return { attachments, dailyNotes }
    },
    async setSettings({ attachments, dailyNotes }) {
      const saved = await change((headers) =>
        files().saveSettings({
          ...headers,
          body: {
            schema: SCHEMA,
            attachments,
            dailyNotes,
            trusted: current.trusted,
          },
        }),
      )
      return { attachments: saved.attachments, dailyNotes: saved.dailyNotes }
    },
    async setTrusted(trusted) {
      const settings = await call(() => files().settings({ schema: SCHEMA }))
      const saved = await change((headers) =>
        files().saveSettings({ ...headers, body: { ...settings, trusted } }),
      )
      current = { ...current, trusted: saved.trusted }
    },
    subscribe(listener) {
      listeners.add(listener)
      if (!stop) {
        stop = new AbortController()
        void follow(stop.signal)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          stop?.abort()
          stop = null
        }
      }
    },
    theorem: {
      async suggestions(path, { limit } = {}) {
        try {
          const page = await files().suggestions({
            schema: SCHEMA,
            path,
            limit,
          })
          return { status: 'ready', page }
        } catch (error) {
          const problem = failure(error, path)
          if (
            problem instanceof WorkspaceRequestError &&
            problem.code === 'thresholds_not_configured'
          )
            return { status: 'unconfigured' }
          throw problem
        }
      },
      decide: (candidateId, decision) =>
        change((headers) =>
          files().decide({ ...headers, candidateId, schema: SCHEMA, decision }),
        ),
      async promote(path, to) {
        const receipt = await change(
          (headers) =>
            files().promote({ ...headers, schema: SCHEMA, path, to }),
          path,
        )
        return toEntry(receipt.entry)
      },
      async exportOkf(path) {
        const bundle = await change((headers) =>
          files().exportOkf({ ...headers, schema: SCHEMA, path }),
        )
        return {
          fileName: bundle.fileName,
          bytes: fromBase64(bundle.bytesBase64),
          conceptCount: bundle.conceptCount,
        }
      },
      importOkf: (path, { fileName, bytes }, { dryRun } = {}) =>
        change((headers) =>
          files().importOkf({
            ...headers,
            schema: SCHEMA,
            path,
            fileName,
            bytesBase64: toBase64(bytes),
            dryRun,
          }),
        ),
    },
  }
}
