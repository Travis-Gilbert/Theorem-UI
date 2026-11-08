// SOURCING: @theoremharness/sdk TheoremClient.fetch (the SDK's passthrough for routes its generated clients do not cover yet) and TheoremError, so callers handle these routes like generated ones
import { TheoremError } from '@theoremharness/sdk'
import { theorem } from './client'

/**
 * The route as a URL on this origin. The SDK's passthrough escapes a ? when it
 * joins a relative path to its base URL, and leaves a whole URL as it is.
 */
export const routeUrl = (path: string, origin: string) =>
  new URL(path, origin).href

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
  // The SDK's passthrough forwards method, headers and body and drops keepalive.
  const response = init.keepalive
    ? await window.fetch(path, { ...request, keepalive: true })
    : await theorem().fetch(routeUrl(path, window.location.origin), request)
  const text = await response.text()
  const body: unknown = text ? JSON.parse(text) : undefined
  if (!response.ok)
    throw new TheoremError({
      message: `${init.method ?? 'GET'} ${path} answered ${response.status}`,
      statusCode: response.status,
      body,
    })
  return body as T
}

/** The route is not there: this Theorem predates the contract. */
export const isNotServed = (error: unknown) =>
  error instanceof TheoremError &&
  (error.statusCode === 404 || error.statusCode === 405)
