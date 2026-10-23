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

/** Methods the page serves; the sandbox calls them, and the page checks each call. */
export interface PageMethods {
  'files.read': {
    params: { path: string; as: FileFormat }
    result: unknown
  }
  'files.list': { params: { glob: string }; result: Array<ListedFile> }
  'files.write': { params: { path: string; text: string }; result: { hash: string } }
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
  'frame.resize': { params: { height: number }; result: null }
  /** A static copy of the frame, for where a live frame would cost too much. */
  'frame.snapshot': { params: { html: string }; result: null }
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
