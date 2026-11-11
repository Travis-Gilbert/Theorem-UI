// SOURCING: @theoremharness/sdk tools.call (the native tool route, adopted as-is).
// Hand-rolled only here: the unwrap of Theorem's result envelope and the walk over
// a spilled result, which the generated client returns verbatim.
import { TheoremError } from '@theoremharness/sdk'
import { mutate, theorem } from './client'

/** A tool answered, and its answer is a refusal or a failure. */
export class NativeToolError extends Error {
  readonly tool: string
  readonly code: string | undefined
  /** The tool's whole answer: a refused run still carries its receipt. */
  readonly answer: unknown
  constructor(tool: string, message: string, code?: string, answer?: unknown) {
    super(message)
    this.name = 'NativeToolError'
    this.tool = tool
    this.code = code
    this.answer = answer
  }
}

type Envelope = {
  ok?: boolean
  isError?: boolean
  result?: unknown
  structuredContent?: unknown
  content_text?: string
}

type Spill = { spilled: true; fetch_handle: string }

const isSpill = (value: unknown): value is Spill => {
  if (typeof value !== 'object' || value === null) return false
  const candidate: { spilled?: unknown; fetch_handle?: unknown } = value
  return candidate.spilled === true && typeof candidate.fetch_handle === 'string'
}

async function invoke(name: string, args: object): Promise<Envelope> {
  try {
    return await mutate<Envelope>((headers) =>
      theorem().tools.call({
        name,
        'X-CSRF-Token': headers['X-CSRF-Token'],
        'Idempotency-Key': headers['Idempotency-Key'],
        body: args as Record<string, unknown>,
      }),
    )
  } catch (error) {
    // A refusal comes back as an HTTP error whose body still says what the tool said.
    const body = error instanceof TheoremError ? error.body : undefined
    if (typeof body === 'object' && body !== null && 'refusal' in body) {
      throw refusal(name, body)
    }
    throw error
  }
}

/** Read every page of a result too large to return inline. */
export async function fetchSpill(handle: string): Promise<unknown> {
  let body = ''
  let offset: number | null | undefined = 0
  while (offset !== null && offset !== undefined) {
    const envelope = await invoke('tool_result_fetch', {
      fetch_handle: handle,
      offset,
    })
    const page = (envelope.result ?? envelope.structuredContent) as {
      content?: string
      text?: string
      body?: string
      next_offset?: number | null
    }
    body += page.content ?? page.text ?? page.body ?? ''
    offset = page.next_offset
  }
  return JSON.parse(body)
}

/**
 * Call a native tool and return what it answered. A programmable graph answer
 * wraps its own `{ok, result}` inside the native one, so both layers are read:
 * an `ok: false` at either is thrown with the code the tool gave.
 */
export async function callTool<T = unknown>(
  name: string,
  args: object = {},
): Promise<T> {
  const envelope = await invoke(name, args)
  let result: unknown = envelope.result ?? envelope.structuredContent
  if (isSpill(result)) result = await fetchSpill(result.fetch_handle)
  if (envelope.ok === false || envelope.isError) throw refusal(name, result)
  if (typeof result === 'object' && result !== null && 'ok' in result) {
    const inner = result as { ok: unknown; result?: unknown }
    if (inner.ok === false) throw refusal(name, result)
    if ('result' in inner) return inner.result as T
  }
  return result as T
}

function refusal(name: string, answer: unknown) {
  const body = (answer ?? {}) as Record<string, unknown>
  const nested = (body.refusal ?? body.error ?? body.result ?? body) as
    | Record<string, unknown>
    | string
  const detail = typeof nested === 'string' ? { message: nested } : nested
  const message =
    typeof detail.message === 'string' ? detail.message : JSON.stringify(detail)
  const code =
    typeof detail.code === 'string'
      ? detail.code
      : typeof detail.error === 'string'
        ? detail.error
        : undefined
  return new NativeToolError(name, message, code, answer)
}
