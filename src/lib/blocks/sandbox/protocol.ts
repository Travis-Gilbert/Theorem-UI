// SOURCING: json-rpc-2.0 (requests, responses and notifications both ways over
// one MessagePort). The method tables are this app's capability bridge (plan
// D9). Values cross by structured clone, the way postMessage sends them.
//
// Everything under sandbox/ runs inside a block's sandbox document as well as
// in the page, so it imports only its own files and the specifiers in the
// block import map (react, react-dom/client, json-rpc-2.0, object-inspect).
import {
  JSONRPCClient,
  JSONRPCServer,
  JSONRPCServerAndClient,
} from 'json-rpc-2.0'
import type { AppTheme, ThemeState } from './theme'

/** How a file is read: its text, parsed JSON, CSV rows, or its bytes. */
export type FileFormat = 'text' | 'json' | 'csv' | 'bytes'

export interface ListedFile {
  path: string
  size: number
  mtimeMs: number
}

/** A run the page asked an agent block for. Agents are wired in plan Phase 5. */
export interface RunRequestResult {
  status: 'not-wired' | 'queued'
  target: string
  message: string
}

/** One value recorded while a block ran, for last-run values. */
export interface Trace {
  line: number
  /** The variables a declaration on this line set, or null for an expression. */
  variables: Record<string, unknown> | null
  value?: unknown
}

/** What one run of a block produced. Every value has been made clonable. */
export interface RunOutcome {
  status: 'ok' | 'error'
  value?: unknown
  error?: { message: string; name: string }
  traces: Array<Trace>
  displayed: number
  durationMs: number
}

export interface AppSelection {
  text: string
  rowId?: string
  field?: string
  /** The nearest `[data-entity-id]` the person selected or clicked, such as one GPU lane. */
  entityId?: string
  entityLabel?: string
  /** The notebook cell (`[data-cell-id]`) the selection or click is in. */
  cellId?: string
  /**
   * Where the element was written, `Table.tsx:21:13`, in an App built from
   * source: the nearest `[data-theorem-source]`.
   */
  source?: string
}

/** The reads a database answers. A subscription keeps one of them current. */
export const DB_READS = [
  'inspect',
  'getNode',
  'getEdge',
  'queryNodes',
  'neighbors',
  'query',
] as const
export type DbRead = (typeof DB_READS)[number]
export type DbMethod = DbRead | 'mutate'

/** A database failure. `code` is the database's own, such as `cypher_write_unsupported`. */
export interface DbFailure {
  code: string
  message: string
}

/** A database call's outcome. A failure is a value, so its code crosses the bridge. */
export type DbOutcome =
  { ok: true; value: unknown } | { ok: false; error: DbFailure }

/** Something a frame's code threw and nothing caught, as the frame saw it. */
export interface FrameError {
  message: string
  /** The error's class, such as `TypeError`. */
  name?: string
  /** Where the frame's document says it was thrown, one-based. */
  line?: number
  column?: number
  stack?: string
}

/** The most uncaught errors one load of a frame reports. */
export const MAX_FRAME_ERRORS = 20

/** Methods the page serves; the sandbox calls them, and the page checks each call. */
export interface PageMethods {
  'files.read': {
    params: { path: string; as: FileFormat }
    result: unknown
  }
  'files.list': { params: { glob: string }; result: Array<ListedFile> }
  'files.write': {
    params: { path: string; text: string }
    result: { hash: string }
  }
  'state.open': {
    params: { name: string }
    result: Record<string, unknown>
  }
  'state.set': {
    params: { name: string; key: string; value: unknown }
    result: null
  }
  'state.delete': { params: { name: string; key: string }; result: null }
  'run.request': { params: { target: string }; result: RunRequestResult }
  /** One call on a declared database. `args` is the method's own argument. */
  'db.call': {
    params: { name: string; method: DbMethod; args?: unknown }
    result: DbOutcome
  }
  /** Keeps a read current; its results arrive as `db.changed` with this id. */
  'db.subscribe': {
    params: { name: string; id: number; method: DbRead; args?: unknown }
    result: null
  }
  'db.unsubscribe': { params: { id: number }; result: null }
  'frame.selection': { params: AppSelection; result: null }
  /** The frame's code threw and nothing caught it. */
  'frame.error': { params: FrameError; result: null }
  'frame.resize': { params: { height: number }; result: null }
  /** A static copy of the frame, for where a live frame would cost too much. */
  'frame.snapshot': { params: { html: string }; result: null }
  /** A page module publishing one of its declared outputs. */
  'module.output': { params: { name: string; value: unknown }; result: null }
  /** A person used a page module's frame: its next events are theirs. */
  'module.used': { params: Record<string, never>; result: null }
  /** A page module sending one of its declared events. */
  'module.emit': { params: { name: string; payload: unknown }; result: null }
}

/** What a page module is handed: its settings and its inputs' values. */
export interface ModuleValues {
  settings: Record<string, unknown>
  inputs: Record<string, unknown>
}

/** The largest snapshot a frame may send, in characters. */
export const MAX_SNAPSHOT = 512 * 1024

/** Methods the sandbox serves; the page calls them. */
export interface SandboxMethods {
  'cell.run': {
    params: { runId: number; inputs: Record<string, unknown> }
    result: RunOutcome
  }
  'state.changed': {
    params: { name: string; value: Record<string, unknown> }
    result: null
  }
  /** A subscribed read's result, now and after each commit that changes it. */
  'db.changed': { params: { id: number; outcome: DbOutcome }; result: null }
  /** A page module's settings or inputs changed. */
  'module.inputs': { params: ModuleValues; result: null }
  /** A route reached one of a page module's declared actions. */
  'module.action': { params: { name: string; payload: unknown }; result: null }
  /**
   * The page's theme changed. A notebook's frame is handed its tokens,
   * resolved, and its mode, for its root; a hosted App's is handed its look
   * (`scheme` tells them apart), for the host stylesheet under the App's own.
   */
  'theme.changed': { params: ThemeState | AppTheme; result: null }
}

/** Something that carries messages: a MessagePort, a Worker or a worker's global scope. */
export interface MessageCarrier {
  postMessage: (message: unknown) => void
  onmessage: ((event: MessageEvent) => unknown) | null
}

export type Rpc = JSONRPCServerAndClient

/** A JSON-RPC peer over a message carrier: it serves methods and calls the other side's. */
export function rpcOver(carrier: MessageCarrier): Rpc {
  const rpc = new JSONRPCServerAndClient(
    // A refused call goes back to the caller as an error response; it is not
    // this side's error to log.
    new JSONRPCServer({ errorListener: () => {} }),
    new JSONRPCClient((request) => {
      carrier.postMessage(request)
    }),
  )
  carrier.onmessage = (event: MessageEvent) => {
    void rpc.receiveAndSend(event.data, undefined, undefined)
  }
  ;(carrier as Partial<MessagePort>).start?.()
  return rpc
}

/** A table of methods, each with its params and result. */
type MethodTable<TTable> = {
  [TMethod in keyof TTable]: { params: object; result: unknown }
}

/** Calls a method on the other side, typed by its table. */
export function call<
  TTable extends MethodTable<TTable>,
  TMethod extends keyof TTable & string,
>(
  rpc: Rpc,
  method: TMethod,
  params: TTable[TMethod]['params'],
): Promise<TTable[TMethod]['result']> {
  return Promise.resolve(
    rpc.request(method, params, undefined) as PromiseLike<
      TTable[TMethod]['result']
    >,
  )
}

/** Serves a method to the other side, typed by its table. */
export function serve<
  TTable extends MethodTable<TTable>,
  TMethod extends keyof TTable & string,
>(
  rpc: Rpc,
  method: TMethod,
  handler: (
    params: TTable[TMethod]['params'],
  ) => TTable[TMethod]['result'] | Promise<TTable[TMethod]['result']>,
): void {
  rpc.addMethod(method, (params) =>
    handler(params as TTable[TMethod]['params']),
  )
}

/** The messages that hand a sandbox document its port. */
export const READY_MESSAGE = 'theorem:block-ready'
export const CONNECT_MESSAGE = 'theorem:block-connect'
