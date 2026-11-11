import { TheoremError } from '@theoremharness/sdk'

const PREFIX = 'theorem.pending-send:'
const REFUSED_PREFIX = 'theorem.refused-send:'
/** The model a turn names cannot run, so replaying that turn fails the same way. */
const MODEL_SETUP_FAILURES = new Set([
  'chat_model_credential_missing',
  'chat_model_catalog_invalid',
  'chat_model_credential_undeclared',
  'chat_model_endpoint_undeclared',
  'chat_model_unconfigured',
  'chat_model_not_configured',
  'chat_model_unknown',
])
/**
 * Answered before Theorem looks at the send, or a request to try later: these
 * say nothing about the send itself.
 */
const NO_VERDICT = new Set([401, 403, 408, 425, 429])
type PendingSend = { body: string; key: string; revision: string }
type Answer = {
  code?: string
  detail?: string
  run?: { runId?: unknown }
}

/** Theorem refused a saved send for good, so its message never went in. */
export class RefusedSend extends TheoremError {
  constructor(
    readonly text: string,
    statusCode: number,
    body: unknown,
  ) {
    super({ statusCode, body })
  }
}

/**
 * A turn that went in but whose run did not start, for a reason replaying cannot
 * change. Theorem words the run's failure as `cause: detail`.
 */
export function modelCannotStart(
  problem: { code?: unknown; detail?: unknown } | undefined,
) {
  return (
    problem?.code === 'chat_run_start_pending' &&
    typeof problem.detail === 'string' &&
    MODEL_SETUP_FAILURES.has(problem.detail.split(':', 1)[0] ?? '')
  )
}

/**
 * Whether Theorem's answer settles a send, so it is not replayed. Unknown outcomes
 * stay replayable. A first send's refusal cannot have gone in; a replay's can only
 * be taken from Theorem itself, as a proxy's 404 knows nothing of the send.
 */
function settles(
  response: Response,
  answer: Answer | undefined,
  replay: boolean,
) {
  if (response.ok) return typeof answer?.run?.runId === 'string'
  if (MODEL_SETUP_FAILURES.has(answer?.code ?? '') || modelCannotStart(answer))
    return true
  if (response.status < 400 || response.status >= 500) return false
  if (answer?.code === 'chat_run_start_pending') return false
  return (
    !replay || (answer?.code !== undefined && !NO_VERDICT.has(response.status))
  )
}

/** Use the SDK's supported fetch hook to retain its exact send identity.
 * Session storage survives reloads without persisting credentials or CSRF.
 */
export function createSendRecovery(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  transport: typeof fetch,
) {
  const slot = (threadId: string) => `${PREFIX}${threadId}`
  const refusedSlot = (threadId: string) => `${REFUSED_PREFIX}${threadId}`
  const read = (threadId: string): PendingSend | undefined => {
    const value = storage.getItem(slot(threadId))
    return value ? (JSON.parse(value) as PendingSend) : undefined
  }
  const trackedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    const match = /^\/api\/chat\/v1\/threads\/([^/]+)\/messages$/.exec(path)
    if (request.method !== 'POST' || !match?.[1]) return transport(request)
    const body = await request.clone().text()
    if ('role' in JSON.parse(body)) return transport(request)
    const threadId = decodeURIComponent(match[1])
    const pending = {
      body,
      key: request.headers.get('Idempotency-Key') ?? '',
      revision: request.headers.get('If-Match') ?? '',
    }
    const existing = read(threadId)
    if (existing && (existing.key !== pending.key || existing.body !== body)) {
      throw new Error(
        'A previous message is awaiting recovery. Reload this conversation to resume it.',
      )
    }
    storage.setItem(slot(threadId), JSON.stringify(pending))
    const response = await transport(request)
    const answer = (await response
      .clone()
      .json()
      .catch(() => undefined)) as Answer | undefined
    if (settles(response, answer, existing !== undefined))
      storage.removeItem(slot(threadId))
    return response
  }
  return {
    fetch: Object.assign(trackedFetch, { preconnect: transport.preconnect }),
    async resume(
      threadId: string,
      origin: string,
      csrfToken: string,
      text?: string,
      abortSignal?: AbortSignal,
    ) {
      const pending = read(threadId)
      if (!pending) return undefined
      if (text !== undefined && JSON.parse(pending.body).text !== text) {
        throw new Error(
          'Your previous message is awaiting recovery. Reload this conversation to resume it before sending another message.',
        )
      }
      const response = await trackedFetch(
        `${origin}/api/chat/v1/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: 'POST',
          signal: AbortSignal.any([
            AbortSignal.timeout(600_000),
            ...(abortSignal ? [abortSignal] : []),
          ]),
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            'Idempotency-Key': pending.key,
            'If-Match': pending.revision,
          },
          body: pending.body,
        },
      )
      const body = await response.json().catch(() => undefined)
      if (!response.ok) {
        if (!read(threadId) && body?.code !== 'chat_run_start_pending') {
          const { text: refused } = JSON.parse(pending.body)
          throw new RefusedSend(refused, response.status, body)
        }
        throw new TheoremError({ statusCode: response.status, body })
      }
      if (typeof body?.run?.runId !== 'string') {
        throw new Error(
          'The response did not include a run. Reload the conversation to check its status.',
        )
      }
      return body.run.runId as string
    },
    has(threadId: string) {
      return read(threadId) !== undefined
    },
    /** The idempotency key of the send saved for this thread. */
    pendingKey(threadId: string) {
      return read(threadId)?.key
    },
    /** Keeps a refused send's text, which only this holds, for its chat's composer. */
    holdRefused(threadId: string, text: string) {
      const held = storage.getItem(refusedSlot(threadId))
      storage.setItem(refusedSlot(threadId), held ? `${held}\n\n${text}` : text)
    },
    takeRefused(threadId: string) {
      const text = storage.getItem(refusedSlot(threadId))
      if (text !== null) storage.removeItem(refusedSlot(threadId))
      return text ?? undefined
    },
  }
}
