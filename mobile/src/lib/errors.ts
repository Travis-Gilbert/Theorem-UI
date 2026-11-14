// SOURCING: @theoremharness/sdk TheoremError (statusCode, body); no React Native imports, so the wording is testable on its own
//
// What the person is told about a failed request. The SDK's error message is an
// HTTP dump (status line and raw body), which is for logs; the interface gets
// the server's own words when it sent some, and otherwise a sentence by status.

/** The HTTP status of a failed SDK request, when it got that far. */
export function statusOf(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  return typeof status === 'number' ? status : undefined
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

/** The sentence a server put in its problem body, where it keeps one. */
function bodyText(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const { detail, title, message, error } = body as Record<string, unknown>
  return text(detail) ?? text(title) ?? text(message) ?? text(error) ?? bodyText(error)
}

/** A message that reads as a sentence: its first line, unless that is serialized JSON. */
function plainMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  const first = error.message.split('\n')[0]?.trim()
  return first && !/^[{[]/.test(first) ? first : undefined
}

/** Readable failure text; raw diagnostics stay out of the interface. */
export function describeError(error: unknown): string {
  const status = statusOf(error)
  const detail = bodyText((error as { body?: unknown } | null)?.body)
  if (detail) return detail
  if (status === 401 || status === 403) return 'Theorem refused this request. Sign in again.'
  if (status === 409 || status === 412) return 'The conversation changed on the server. It has been reloaded.'
  if (status && status >= 500) return 'Theorem is unavailable right now. Try again shortly.'
  // An HTTP failure's message is the dump, so it is never the sentence.
  if (status) return 'Theorem could not take that request.'
  return plainMessage(error) ?? 'Something went wrong.'
}
