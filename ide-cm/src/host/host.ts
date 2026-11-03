// SOURCING: none — the seam between OpenIDEA's Tauri-shaped frontend and a browser. OpenIDEA
// reaches its backend through `invoke(command, args)`, one event bus (`ide://event`), Tauri
// `Channel`s for streams, and a few window/dialog/opener plugins. This file defines what a browser
// provides for each, and the shims in `tauri-*.ts` route the frontend's imports here. The commands
// themselves are answered by `commands/` over @theoremharness/sdk.

/** `ErrorKind` of OpenIDEA's `IdeError`: the frontend shows these and branches on a few. */
export type ErrorKind =
  | 'notFound'
  | 'alreadyExists'
  | 'permissionDenied'
  | 'invalidInput'
  | 'outOfSync'
  | 'cancelled'
  | 'unavailable'
  | 'io'
  | 'protocol'
  | 'internal'

/** What a rejected command carries. A plain object, not an `Error`: the generated bindings turn a
 * non-`Error` rejection into `{ status: "error", error }`, which is what `call()` unwraps. */
export interface HostFailure {
  kind: ErrorKind
  message: string
}

export const failure = (kind: ErrorKind, message: string): HostFailure => ({ kind, message })

export const unavailable = (what: string, why = 'this Theorem workspace host does not provide it'): HostFailure =>
  failure('unavailable', `${what} is not available: ${why}`)

/**
 * A refusal for the plugin shims, whose callers render `e instanceof Error ? e.message : String(e)`:
 * an `Error` with the failure's sentence that still carries `kind: 'unavailable'`.
 */
export const refusalError = (refused: HostFailure): Error & HostFailure => Object.assign(new Error(refused.message), refused)

/** Anything the host's `Channel` arguments can be fed: a stream of messages for one command. */
export interface HostChannel<T = unknown> {
  readonly id: number
  send(message: T): void
}

export type CommandArgs = Record<string, unknown>
export type CommandHandler = (args: CommandArgs) => unknown | Promise<unknown>

export interface PickOptions {
  directory?: boolean
  multiple?: boolean
  title?: string
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
}

/** Behaviours of the browser window that the desktop frontend expects to own. */
export interface WindowBehaviours {
  readonly label: string
  setTitle(title: string): void
  /** A browser tab cannot be closed by script unless a script opened it. */
  close(): Promise<void>
  isFocused(): boolean
  /** Handlers run before the page unloads; one may veto, which asks the browser to confirm. */
  onCloseRequested(handler: (event: { preventDefault(): void }) => void | Promise<void>): () => void
  onResized(handler: () => void): () => void
  /** Browser zoom is the user's; the frontend's zoom is applied as a CSS zoom on the root. */
  setZoom(factor: number): void
}

export interface BrowserHost {
  /** Where this host's commands are answered, for the status line and evidence. */
  readonly description: string
  invoke(command: string, args?: CommandArgs): Promise<unknown>
  /** Subscribe to events destined for the frontend (the `ide://event` bus). */
  subscribe(handler: (payload: unknown) => void): () => void
  emit(payload: unknown): void
  /** A named event other than the IDE bus (menu, launch, application focus). */
  listen(event: string, handler: (payload: unknown) => void): () => void
  emitTo(event: string, payload: unknown): void
  openExternal(url: string): void
  pick(options: PickOptions): Promise<string | string[] | null>
  save(options: PickOptions): Promise<string | null>
  readonly window: WindowBehaviours
  /**
   * What the frontend asked for that this host does not provide, keyed by command name or by
   * platform feature (`window.minimize`, `opener.revealItemInDir`), with how often and why.
   */
  readonly refused: ReadonlyMap<string, Refusal>
  /** Record a refusal of `feature` and return the typed failure to throw or reject with. */
  refuse(feature: string, what: string, why?: string): HostFailure
  /** Called each time something is refused; the status bar shows the running list. */
  onRefused(handler: (feature: string, refusal: Refusal) => void): () => void
}

/** One unavailable feature as the host has seen it. */
export interface Refusal {
  count: number
  /** The sentence the frontend was given, naming the feature and why it is unavailable. */
  message: string
}

let installed: BrowserHost | undefined

export function installHost(host: BrowserHost): void {
  installed = host
}

/** True once a host is installed: the frontend's `isTauri()` answers this. */
export function hostAvailable(): boolean {
  return installed !== undefined
}

export function currentHost(): BrowserHost {
  if (!installed) {
    throw new Error('No Theorem workspace host is installed; call installHost() before the frontend starts')
  }
  return installed
}
