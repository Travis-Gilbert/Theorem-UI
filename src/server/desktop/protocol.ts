// SOURCING: zod. Runtime schemas for the messages whose TypeScript types ts-rs
// generates from desktop/protocol/src/lib.rs; protocol.test.ts checks at
// compile time that each schema parses exactly its generated type.
import { z } from 'zod'
import type { ToHost } from '#/lib/desktop/bindings/ToHost'
import type { ToServer } from '#/lib/desktop/bindings/ToServer'

const folderGrant = z.object({ path: z.string(), name: z.string() })

export const hostEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fileSaved'), path: z.string() }),
  z.object({ type: z.literal('grantsChanged'), grants: z.array(folderGrant) }),
  z.object({ type: z.literal('leaving') }),
])

/**
 * A bridge call as the host's serde parses it. Unknown params are stripped, so
 * a relayed call always parses on the host: a line the host cannot parse is a
 * log line to it, and the call would never be answered.
 */
export const hostCallSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('pickFolder'), params: z.object({}) }),
  z.object({
    method: z.literal('openNativeEditor'),
    params: z.object({ path: z.string() }),
  }),
  z.object({
    method: z.literal('revealInFinder'),
    params: z.object({ path: z.string() }),
  }),
  z.object({
    method: z.literal('openWithDefault'),
    params: z.object({ path: z.string() }),
  }),
  z.object({
    method: z.literal('openExternal'),
    params: z.object({ url: z.string() }),
  }),
  z.object({
    method: z.literal('setDocumentEdited'),
    params: z.object({ edited: z.boolean() }),
  }),
  z.object({
    method: z.literal('notify'),
    params: z.object({
      title: z.string(),
      body: z.string().nullable().default(null),
    }),
  }),
])

/** Every bridge method, in the order the host's `HostCall` enum lists them. */
export const HOST_CALL_METHODS = hostCallSchema.options.map(
  (option) => option.shape.method.value,
)

const rpcError = z.object({ code: z.number().int(), message: z.string() })

/** A line the host writes to the server's stdin. */
export const toServerSchema = z.discriminatedUnion('ctl', [
  z.object({
    ctl: z.literal('hello'),
    // Never empty: `/desktop/session?secret=` must not match.
    secret: z.string().min(1),
    grants: z.array(folderGrant),
  }),
  z.object({ ctl: z.literal('grants'), grants: z.array(folderGrant) }),
  z.object({
    ctl: z.literal('rpc-result'),
    id: z.number().int().nonnegative(),
    result: z.json().nullable(),
    error: rpcError.nullable(),
  }),
  z.object({ ctl: z.literal('event'), event: hostEventSchema }),
])

/**
 * A line the server writes to stdout for the host. The host reads it with
 * `ToHost::parse_line`; the stub host and the tests read it with this.
 */
export const toHostSchema = z.discriminatedUnion('ctl', [
  z.object({
    ctl: z.literal('ready'),
    port: z.number().int(),
    blockPort: z.number().int(),
  }),
  z.object({
    ctl: z.literal('rpc'),
    id: z.number().int().nonnegative(),
    call: hostCallSchema,
  }),
])

/** `RpcError::FAILED` in the protocol crate: the call could not complete. */
export const RPC_FAILED = -32002

/**
 * One control message as one line. `JSON.stringify` escapes every newline
 * inside strings, so the message can never span two lines.
 */
export function encodeLine(message: ToHost | ToServer): string {
  return `${JSON.stringify(message)}\n`
}

/**
 * Parses one control line the way `ToHost::parse_line` does: `undefined` for a
 * log line, or for anything else that is not a message of `schema`'s shape.
 */
export function parseLine<T>(
  schema: z.ZodType<T>,
  line: string,
): T | undefined {
  const text = line.trim()
  if (!text.startsWith('{')) return undefined
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
