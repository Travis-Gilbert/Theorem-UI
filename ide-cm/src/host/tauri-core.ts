// `@tauri-apps/api/core` as the frontend imports it (a Vite alias points here), answered by the
// browser host instead of a Tauri runtime. `invoke` goes to the installed host; `Channel` is the
// stream a command writes to; there is no `__TAURI_INTERNALS__` anywhere.
import { currentHost, hostAvailable, type HostChannel } from './host'

export type InvokeArgs = Record<string, unknown> | number[] | ArrayBuffer | Uint8Array
export type InvokeOptions = { headers?: HeadersInit }

let nextChannel = 1

/** A one-way stream from a command to the frontend, as `Channel` is in Tauri. */
export class Channel<T = unknown> implements HostChannel<T> {
  readonly id = nextChannel++
  onmessage: (message: T) => void = () => {}

  /** Called by the command that owns the stream. */
  send(message: T): void {
    this.onmessage(message)
  }

  toJSON(): string {
    return `__CHANNEL__:${this.id}`
  }
}

export function invoke<T>(command: string, args?: InvokeArgs, _options?: InvokeOptions): Promise<T> {
  return currentHost().invoke(command, (args ?? {}) as Record<string, unknown>) as Promise<T>
}

export function isTauri(): boolean {
  return hostAvailable()
}

/** Files are read through the workspace, not through an asset protocol. */
export function convertFileSrc(path: string): string {
  return `/api/environment/v1/files/${encodeURIComponent(path)}`
}

export class Resource {
  constructor(readonly rid: number) {}
  async close(): Promise<void> {}
}

// Kept so the frontend's remote-development hook still type-checks; there is nowhere to route to.
export type InvokeRoute = (cmd: string, args?: InvokeArgs, options?: InvokeOptions) => Promise<unknown> | null
export function setInvokeRoute(_next: InvokeRoute | null): void {}
export const invokeLocal = invoke
