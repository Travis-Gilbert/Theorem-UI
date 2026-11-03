// SOURCING: node:readline frames stdin into lines and zod (./protocol) checks
// each message. The dispatch is hand-rolled: the protocol is our own
// (desktop/protocol/src/lib.rs) and no library models it.
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { JSONRPCErrorException } from 'json-rpc-2.0'
import type { HostCall } from '#/lib/desktop/bindings/HostCall'
import type { HostEvent } from '#/lib/desktop/bindings/HostEvent'
import type { ToHost } from '#/lib/desktop/bindings/ToHost'
import type { ToServer } from '#/lib/desktop/bindings/ToServer'
import type { JsonValue } from '#/lib/desktop/bindings/serde_json/JsonValue'
import { setGrants } from './grants'
import { RPC_FAILED, encodeLine, parseLine, toServerSchema } from './protocol'
import { setLaunchSecret } from './session'

interface PendingCall {
  resolve: (result: JsonValue | null) => void
  reject: (error: JSONRPCErrorException) => void
  timer?: ReturnType<typeof setTimeout>
}

let output: Writable | undefined
let nextCallId = 1
const pendingCalls = new Map<number, PendingCall>()
const eventListeners = new Set<(event: HostEvent) => void>()

export interface ControlStreams {
  /** The host's `ToServer` lines: the server's stdin. */
  input: Readable
  /** Where `ToHost` lines go: the server's stdout, shared with its logs. */
  output: Writable
  /** Called when `input` ends, which means the host has gone. */
  onClose?: () => void
}

/** Starts reading `ToServer` lines; `ToHost` lines go to `output`. */
export function startControlChannel(streams: ControlStreams): void {
  output = streams.output
  const lines = createInterface({ input: streams.input, crlfDelay: Infinity })
  lines.on('line', (line) => {
    const message = parseLine(toServerSchema, line)
    if (message) receive(message)
    // Never echo the line: a malformed hello would print the launch secret.
    else if (line.trim()) {
      console.error(
        `[desktop] ignored a ${line.length}-byte stdin line that is not a control message`,
      )
    }
  })
  if (streams.onClose) lines.on('close', streams.onClose)
}

/** Writes one control line. Nothing else this server prints parses as one. */
export function sendToHost(message: ToHost): void {
  if (!output) throw new Error('The desktop control channel is not started')
  output.write(encodeLine(message))
}

/**
 * Relays a bridge call to the host. Resolves with the host's result, or
 * rejects with its error, or with `RpcError::FAILED` once `timeoutMs` passes.
 */
export function callHost(
  call: HostCall,
  timeoutMs?: number,
): Promise<JsonValue | null> {
  const id = nextCallId++
  return new Promise((resolve, reject) => {
    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            pendingCalls.delete(id)
            reject(
              new JSONRPCErrorException(
                `The desktop host did not answer ${call.method} within ${timeoutMs / 1000} seconds`,
                RPC_FAILED,
              ),
            )
          }, timeoutMs)
    pendingCalls.set(id, { resolve, reject, timer })
    sendToHost({ ctl: 'rpc', id, call })
  })
}

/** Host events for the page, except `grantsChanged`: see `onGrantsChanged`. */
export function onHostEvent(listener: (event: HostEvent) => void): () => void {
  eventListeners.add(listener)
  return () => eventListeners.delete(listener)
}

function receive(message: ToServer): void {
  switch (message.ctl) {
    case 'hello':
      setLaunchSecret(message.secret)
      setGrants(message.grants)
      return
    case 'grants':
      setGrants(message.grants)
      return
    case 'rpc-result': {
      const pending = pendingCalls.get(message.id)
      if (!pending) {
        // Its call timed out, or the host answered twice.
        console.error(`[desktop] no pending call ${message.id} to answer`)
        return
      }
      pendingCalls.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) {
        pending.reject(
          new JSONRPCErrorException(message.error.message, message.error.code),
        )
      } else pending.resolve(message.result)
      return
    }
    case 'event':
      // Grants have one source of truth, so a grants event updates them and
      // reaches the page through onGrantsChanged like a `grants` message.
      if (message.event.type === 'grantsChanged')
        setGrants(message.event.grants)
      else for (const listener of eventListeners) listener(message.event)
  }
}
