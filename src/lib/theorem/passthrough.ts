// SOURCING: @theoremharness/sdk TheoremClient.fetch (the SDK's passthrough for routes its generated clients do not cover yet) and TheoremError, so callers handle these routes like generated ones
import { TheoremError } from '@theoremharness/sdk'
import { theorem } from './client'

/**
 * One JSON request to a Theorem route the vendored SDK has no client for yet
 * (models, credentials, preferences, skills, imports; see Theorem's
 * SPEC-THEOREM-UI-MODELS-KEYS-IMPORTS-1.0). Failures throw TheoremError with
 * the problem body, as the generated clients do. When the SDK is regenerated
 * with these routes, its typed clients replace the callers of this function.
 */
export async function theoremJson<T>(
  path: string,
  init: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
    keepalive?: boolean
  } = {},
): Promise<T> {
  const request = {
    method: init.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(init.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }
  // The SDK joins a relative path onto its base URL as path segments, which
  // percent-encodes a query's `?` into the path; an absolute URL it sends as is.
  const url = new URL(path, window.location.origin).toString()
  // The SDK's passthrough forwards method, headers and body and drops keepalive.
  const response = init.keepalive
    ? await window.fetch(url, { ...request, keepalive: true })
    : await theorem().fetch(url, request)
  return readTheoremJson<T>(response)
}

/** Preserve the HTTP status even when a relay sends a non-JSON refusal. */
export async function readTheoremJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    let body: unknown
    try {
      body = text ? JSON.parse(text) : undefined
    } catch {
      // An intermediary can refuse the request without a Theorem problem.
    }
    throw new TheoremError({
      message: `Theorem answered ${response.status}`,
      statusCode: response.status,
      body,
    })
  }
  return (text ? JSON.parse(text) : undefined) as T
}

/** The route is not there: this Theorem predates the contract. */
export const isNotServed = (error: unknown) =>
  error instanceof TheoremError &&
  (error.statusCode === 404 || error.statusCode === 405)
