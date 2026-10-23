// Fixtures for the desktop server's tests: the environment the desktop host
// sets (docs/desktop/local-server.md), and a fake host on the other end of the
// control channel.
import { afterEach, beforeEach } from 'bun:test'
import { createInterface } from 'node:readline'
import { PassThrough } from 'node:stream'
import type { HostCall } from '#/lib/desktop/bindings/HostCall'
import type { RpcError } from '#/lib/desktop/bindings/RpcError'
import type { ToHost } from '#/lib/desktop/bindings/ToHost'
import type { ToServer } from '#/lib/desktop/bindings/ToServer'
import type { JsonValue } from '#/lib/desktop/bindings/serde_json/JsonValue'
import { startControlChannel } from '#/server/desktop/control'
import { encodeLine, parseLine, toHostSchema } from '#/server/desktop/protocol'

export const TEST_PORT = 4317
export const TEST_HOST = `127.0.0.1:${TEST_PORT}`
export const TEST_ORIGIN = `http://${TEST_HOST}`

const DESKTOP_ENV = {
  THEOREM_DESKTOP: '1',
  THEOREM_DESKTOP_DATA_DIR: '/tmp/theorem-desktop-test',
  NITRO_HOST: '127.0.0.1',
  NITRO_PORT: String(TEST_PORT),
  THEOREM_BLOCK_PORT: '4318',
}

/** Runs each test in the current file under the desktop host's environment. */
export function useDesktopEnv(): void {
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const [name, value] of Object.entries(DESKTOP_ENV)) {
      saved[name] = process.env[name]
      process.env[name] = value
    }
  })
  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })
}

type Answer = { result: JsonValue | null } | { error: RpcError }

export interface FakeHost {
  /** Writes one line to the server's stdin. */
  send: (message: ToServer) => void
  /** Writes raw text to the server's stdin. */
  write: (text: string) => void
  /** Every `ToHost` line the server wrote, in order. */
  received: Array<ToHost>
  /** Lines the server wrote that are not control messages. */
  stray: Array<string>
  /** How the host answers bridge calls; `undefined` leaves a call unanswered. */
  answer: (call: HostCall) => Answer | undefined
  /** Ends the server's stdin, as the host does when it quits. */
  end: () => void
  /** True once the server saw its stdin end. */
  closed: boolean
}

/** Starts the control channel against a fake host. */
export function startFakeHost(): FakeHost {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const host: FakeHost = {
    send: (message) => stdin.write(encodeLine(message)),
    write: (text) => stdin.write(text),
    received: [],
    stray: [],
    answer: () => ({ result: null }),
    end: () => stdin.end(),
    closed: false,
  }
  startControlChannel({
    input: stdin,
    output: stdout,
    onClose: () => {
      host.closed = true
    },
  })
  createInterface({ input: stdout }).on('line', (line) => {
    const message = parseLine(toHostSchema, line)
    if (!message) {
      host.stray.push(line)
      return
    }
    host.received.push(message)
    if (message.ctl !== 'rpc') return
    const answer = host.answer(message.call)
    if (!answer) return
    host.send({
      ctl: 'rpc-result',
      id: message.id,
      result: 'result' in answer ? answer.result : null,
      error: 'error' in answer ? answer.error : null,
    })
  })
  return host
}

/** Lets the streams deliver what was written so far. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5))
}

/** Exchanges `secret` for a session; returns the response. */
export async function exchange(
  fetch: (request: Request) => Response | Promise<Response>,
  secret: string,
): Promise<Response> {
  return fetch(
    new Request(
      `${TEST_ORIGIN}/desktop/session?secret=${encodeURIComponent(secret)}`,
      {
        headers: { host: TEST_HOST },
        redirect: 'manual',
      },
    ),
  )
}

/** The `name=value` part of a Set-Cookie header, ready for a Cookie header. */
export function cookieFrom(response: Response): string {
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) throw new Error('No Set-Cookie header')
  return setCookie.split(';')[0] ?? ''
}
