import { TheoremError } from '@theoremharness/sdk'

const PREFIX = 'theorem.pending-send:'
const PRECOMMIT_FAILURES = new Set([
  'chat_model_credential_missing',
  'chat_model_catalog_invalid',
  'chat_model_credential_undeclared',
  'chat_model_endpoint_undeclared',
  'chat_model_unconfigured',
  'chat_model_not_configured',
  'chat_model_unknown',
])
type PendingSend = { body: string; key: string; revision: string }

/** Use the SDK's supported fetch hook to retain its exact send identity.
 * Session storage survives reloads without persisting credentials or CSRF.
 */
export function createSendRecovery(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  transport: typeof fetch,
) {
  const slot = (threadId: string) => `${PREFIX}${threadId}`
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
    const problem = await response
      .clone()
      .json()
      .catch(() => undefined)
    // Unknown outcomes remain replayable. Definitive refusals never committed.
    if (
      (response.ok && typeof problem?.run?.runId === 'string') ||
      (!existing &&
        (PRECOMMIT_FAILURES.has(problem?.code) ||
          (response.status >= 400 &&
            response.status < 500 &&
            problem?.code !== 'chat_run_start_pending')))
    ) {
      storage.removeItem(slot(threadId))
    }
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
      const body = await response.json()
      if (!response.ok)
        throw new TheoremError({ statusCode: response.status, body })
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
  }
}
