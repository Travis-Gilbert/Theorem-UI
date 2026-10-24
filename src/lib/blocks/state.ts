// SOURCING: loro-crdt (one LoroDoc per workspace; each `state("name")`
// collection is a LoroMap in it, so edits from several views, and later
// several devices, merge), the platform fetch and EventSource for the routes
// in docs/desktop/workspace-routes.md. Base64 for the event stream is
// btoa/atob over the bytes.
import { LoroDoc } from 'loro-crdt/base64'
import type { WorkspaceId } from '@/lib/workspace/types'
import type { StateCollections } from './bridge'

/** How a replica reaches the workspace's copy of the state document. */
export interface StateTransport {
  /** The whole document, or null when there is none yet. */
  load: () => Promise<Uint8Array | null>
  /** Sends a local change. */
  push: (update: Uint8Array) => Promise<void>
  /**
   * Calls `onUpdate` with every change made elsewhere, and `onResync` when
   * some may have been missed. Returns an unsubscribe function.
   */
  subscribe: (
    onUpdate: (update: Uint8Array) => void,
    onResync: () => void,
  ) => () => void
}

type Listener = (value: Record<string, unknown>) => void

/**
 * The page's replica of a workspace's block state. Reads are local; local
 * changes go to the workspace's document, and its changes come back.
 */
export class StateReplica implements StateCollections {
  readonly doc = new LoroDoc()
  /** Resolves once the workspace's document has been loaded. */
  readonly ready: Promise<void>
  private readonly listeners = new Map<string, Set<Listener>>()
  private readonly seen = new Map<string, string>()
  private readonly stop: Array<() => void> = []

  constructor(private readonly transport: StateTransport) {
    this.stop.push(this.doc.subscribe(() => this.notify()))
    this.stop.push(
      this.doc.subscribeLocalUpdates((update) => {
        transport.push(update).catch((error: unknown) => {
          console.error('[blocks] saving block state failed', error)
        })
      }),
    )
    this.stop.push(
      transport.subscribe(
        (update) => this.doc.import(update),
        () => void this.load(),
      ),
    )
    this.ready = this.load()
  }

  private async load(): Promise<void> {
    const snapshot = await this.transport.load()
    if (snapshot) this.doc.import(snapshot)
  }

  private notify(): void {
    for (const [name, listeners] of this.listeners) {
      const value = this.snapshot(name)
      const json = JSON.stringify(value)
      if (this.seen.get(name) === json) continue
      this.seen.set(name, json)
      for (const listener of listeners) listener(value)
    }
  }

  snapshot = (name: string): Record<string, unknown> =>
    this.doc.getMap(name).toJSON() as Record<string, unknown>

  set = (name: string, key: string, value: unknown): void => {
    this.doc.getMap(name).set(key, value as never)
    this.doc.commit()
  }

  delete = (name: string, key: string): void => {
    this.doc.getMap(name).delete(key)
    this.doc.commit()
  }

  subscribe = (name: string, listener: Listener): (() => void) => {
    let listeners = this.listeners.get(name)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(name, listeners)
      this.seen.set(name, JSON.stringify(this.snapshot(name)))
    }
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  dispose(): void {
    for (const stop of this.stop.splice(0)) stop()
    this.listeners.clear()
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}

/** The transport over the local server's `state` and `state-events` routes. */
export function desktopStateTransport(id: WorkspaceId): StateTransport {
  const base = `/desktop/workspace/${encodeURIComponent(id)}`
  return {
    async load() {
      const response = await fetch(`${base}/state`)
      if (!response.ok)
        throw new Error(`Loading block state answered ${response.status}`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      return bytes.length ? bytes : null
    },
    async push(update) {
      const response = await fetch(`${base}/state`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Blob([update as BlobPart]),
      })
      if (!response.ok)
        throw new Error(`Saving block state answered ${response.status}`)
    },
    subscribe(onUpdate, onResync) {
      const source = new EventSource(`${base}/state-events`)
      // What changed while the stream was closed was not seen.
      source.onopen = onResync
      source.onmessage = (message: MessageEvent<string>) =>
        onUpdate(fromBase64(message.data))
      return () => source.close()
    },
  }
}

const replicas = new Map<WorkspaceId, StateReplica>()

/** The page's one replica of a workspace's block state. */
export function workspaceState(id: WorkspaceId): StateReplica {
  let replica = replicas.get(id)
  if (!replica) {
    replica = new StateReplica(desktopStateTransport(id))
    replicas.set(id, replica)
  }
  return replica
}
