// SOURCING: @tanstack/react-query (a file's text and bytes as server state,
// shared by every view of the file), lodash-es debounce (saves while typing)
// and async-mutex (one write at a time, each against the hash the previous one
// returned). The conflict rule itself, a write's expectedHash and the
// workspace's change events, is the WorkspaceClient contract's.
//
// A handler's view of a file:
// - `useTextFile(file)` loads the text, saves edits with the hash they were
//   made against, and takes changes made on disk: a clean view reloads, a view
//   with unsaved edits stops and asks (`conflict`).
// - `useFileBytes(file)` and `useObjectUrl(bytes, type)` are for views that
//   hand the bytes to the platform (images, media, PDF).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { Mutex } from 'async-mutex'
import debounce from 'lodash-es/debounce'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { WorkspaceConflictError } from '@/lib/workspace/types'
import type { WorkspaceClient, WorkspaceEvent } from '@/lib/workspace/types'

/** A file in a workspace, as handlers receive it. */
export type FileRef = { client: WorkspaceClient; path: string }

export const fileTextKey = (workspaceId: string, path: string) =>
  ['desktop', 'workspace', workspaceId, 'file', path, 'text'] as const

export const fileBytesKey = (workspaceId: string, path: string) =>
  ['desktop', 'workspace', workspaceId, 'file', path, 'bytes'] as const

/** Edits are written once typing pauses this long, and at least this often. */
const SAVE_DELAY_MS = 400
const SAVE_MAX_WAIT_MS = 2000

/** Whether `event` says the file at `path` may have new contents. */
const touches = (event: WorkspaceEvent, path: string) =>
  event.type === 'resync' ||
  ((event.type === 'changed' || event.type === 'created') &&
    event.entry.path === path)

type TextData = { text: string; hash: string }

type SyncState = {
  /** Edits not yet written. */
  draft: string | null
  /** The disk's hash when a conflict was found; null if the file is gone. */
  conflict: { hash: string | null } | null
  saveFailed: boolean
}

/** One view's edits to one file, and what it does about changes on disk. */
class TextFileSync {
  state: SyncState = { draft: null, conflict: null, saveFailed: false }
  private readonly listeners = new Set<() => void>()
  private readonly mutex = new Mutex()
  /** Hashes this view wrote, so their change events are not taken as news. */
  private readonly written = new Set<string>()
  readonly save = debounce(() => void this.write(), SAVE_DELAY_MS, {
    maxWait: SAVE_MAX_WAIT_MS,
  })

  constructor(
    readonly client: WorkspaceClient,
    readonly path: string,
    private readonly queryClient: QueryClient,
  ) {}

  get queryKey() {
    return fileTextKey(this.client.workspace.id, this.path)
  }

  private current() {
    return this.queryClient.getQueryData<TextData>(this.queryKey)
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  edit(text: string) {
    this.set({ draft: text })
    if (!this.state.conflict) this.save()
  }

  /**
   * Writes the draft against the hash it was made from, or against
   * `expectedHash` when the person chose to overwrite.
   */
  write(expectedHash?: string | null) {
    return this.mutex.runExclusive(async () => {
      const text = this.state.draft
      if (text === null) return
      if (this.state.conflict && expectedHash === undefined) return
      try {
        const { hash } = await this.client.write(this.path, text, {
          expectedHash:
            expectedHash === undefined ? this.current()?.hash : expectedHash,
        })
        this.written.add(hash)
        this.queryClient.setQueryData<TextData>(this.queryKey, { text, hash })
        this.set({
          conflict: null,
          saveFailed: false,
          // Typing may have gone on while the write was out.
          draft: this.state.draft === text ? null : this.state.draft,
        })
      } catch (error) {
        if (error instanceof WorkspaceConflictError)
          this.set({ conflict: { hash: error.currentHash } })
        else this.set({ saveFailed: true })
      }
    })
  }

  onEvent = async (event: WorkspaceEvent) => {
    if (!touches(event, this.path)) return
    // Our own write's event can overtake the write's reply.
    await this.mutex.waitForUnlock()
    const hash = event.type === 'changed' ? event.hash : null
    if (hash && (this.written.has(hash) || hash === this.current()?.hash))
      return
    if (this.state.draft === null) {
      void this.queryClient.invalidateQueries({
        queryKey: this.queryKey,
        exact: true,
      })
      return
    }
    if (event.type === 'resync') return
    this.save.cancel()
    this.set({ conflict: { hash } })
  }

  async resolve(side: 'mine' | 'disk') {
    this.save.cancel()
    if (side === 'mine') {
      await this.write(this.state.conflict?.hash ?? null)
      return
    }
    this.set({ draft: null, conflict: null, saveFailed: false })
    await this.queryClient.invalidateQueries({
      queryKey: this.queryKey,
      exact: true,
    })
  }
}

export interface TextFile {
  /** The text to show: unsaved edits, else the file on disk. */
  text: string | undefined
  isPending: boolean
  isError: boolean
  /** Holds a NUL byte, as git decides; such a file is not shown as text. */
  isBinary: boolean
  /** Edits not yet written. */
  dirty: boolean
  /**
   * The file changed on disk while this view had unsaved edits. Saving stops
   * until `resolve` picks a side.
   */
  conflict: boolean
  /** The last write failed for a reason other than a conflict. */
  saveFailed: boolean
  /** Replaces the text; written after a pause. */
  setText: (text: string) => void
  /** Keep this view's edits (overwrite the disk) or take the disk's. */
  resolve: (side: 'mine' | 'disk') => Promise<void>
  /** Writes pending edits now. */
  flush: () => Promise<void>
}

export function useTextFile({ client, path }: FileRef): TextFile {
  const queryClient = useQueryClient()
  const [sync, setSync] = useState(
    () => new TextFileSync(client, path, queryClient),
  )
  if (sync.client !== client || sync.path !== path)
    setSync(new TextFileSync(client, path, queryClient))
  const state = useSyncExternalStore(
    sync.subscribe,
    sync.getSnapshot,
    sync.getSnapshot,
  )
  const query = useQuery({
    queryKey: sync.queryKey,
    queryFn: (): Promise<TextData> => client.readText(path),
    staleTime: Infinity,
    retry: false,
  })

  useEffect(
    () => client.subscribe((event) => void sync.onEvent(event)),
    [client, sync],
  )
  // Edits still waiting when the view closes are written then.
  useEffect(() => () => sync.save.flush(), [sync])

  const text = state.draft ?? query.data?.text
  return {
    text,
    isPending: query.isPending,
    isError: query.isError,
    isBinary: query.data?.text.includes('\u0000') ?? false,
    dirty: state.draft !== null,
    conflict: state.conflict !== null,
    saveFailed: state.saveFailed,
    setText: (next) => {
      if (next !== text) sync.edit(next)
    },
    resolve: (side) => sync.resolve(side),
    flush: async () => {
      sync.save.cancel()
      await sync.write()
    },
  }
}

/** The file's bytes, refetched when it changes. */
export function useFileBytes({ client, path }: FileRef) {
  const queryClient = useQueryClient()
  const workspaceId = client.workspace.id
  useEffect(
    () =>
      client.subscribe((event) => {
        if (touches(event, path))
          void queryClient.invalidateQueries({
            queryKey: fileBytesKey(workspaceId, path),
            exact: true,
          })
      }),
    [client, path, queryClient, workspaceId],
  )
  return useQuery({
    queryKey: fileBytesKey(workspaceId, path),
    queryFn: () => client.read(path),
    staleTime: Infinity,
    retry: false,
  })
}

/** A `blob:` URL for `bytes`, revoked when the bytes change or the view goes. */
export function useObjectUrl(
  bytes: Uint8Array | undefined,
  type: string | null,
): string | undefined {
  const [entry, setEntry] = useState<{ bytes: Uint8Array; url: string }>()
  useEffect(() => {
    // The URL is a browser resource whose lifetime has to straddle commit, so
    // allocating and revoking it both belong to the effect.
    if (!bytes) return
    const url = URL.createObjectURL(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: type ?? '' }),
    )
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntry({ bytes, url })
    return () => URL.revokeObjectURL(url)
  }, [bytes, type])
  return entry && entry.bytes === bytes ? entry.url : undefined
}
