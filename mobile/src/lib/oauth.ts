// SOURCING: none. RFC 6749 authorization code, RFC 7636 PKCE (S256), RFC 8707 resource indicators, RFC 9207 iss, as Theorem's OAuth server implements them (rustyred-thg-server oauth.rs) and the web client uses them (Theorem-UI src/server/theorem-auth.ts)
//
// Pure protocol steps, separated from storage and the system browser so they
// can be tested without a device.

/** The scopes a chat client needs; models:invoke is granted only to configured clients. */
export const SCOPE = 'run:read run:write models:invoke'

export type AuthorizationServer = {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
}

export type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

export type Tokens = {
  accessToken: string
  refreshToken?: string
  /** Seconds since the epoch. */
  expiresAt?: number
}

/** Theorem binds tokens to its MCP resource, as the web client's tokens are. */
export const resourceOf = (issuer: string) => `${issuer.replace(/\/$/, '')}/mcp`

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Unpadded base64url, without depending on btoa. */
export function base64url(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]!
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]!
  }
  return out
}

export async function pkceChallenge(
  verifier: string,
  sha256: (data: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer>,
): Promise<string> {
  return base64url(new Uint8Array(await sha256(new TextEncoder().encode(verifier))))
}

export function authorizeUrl(
  server: AuthorizationServer,
  request: {
    clientId: string
    redirectUri: string
    state: string
    challenge: string
  },
): string {
  const url = new URL(server.authorization_endpoint)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    scope: SCOPE,
    state: request.state,
    code_challenge: request.challenge,
    code_challenge_method: 'S256',
    resource: resourceOf(server.issuer),
  }).toString()
  return url.href
}

export class SignInError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** The authorization code from the callback, after checking it answers this request. */
export function readCallback(
  callback: string,
  expected: { redirectUri: string; state: string; issuer: string },
): string {
  const url = new URL(callback)
  const redirect = new URL(expected.redirectUri)
  if (url.origin !== redirect.origin || url.pathname !== redirect.pathname)
    throw new SignInError('redirect_mismatch', 'Sign-in returned to an unexpected address.')
  const params = url.searchParams
  if (params.get('state') !== expected.state)
    throw new SignInError('state_mismatch', 'Sign-in answered a different request. Try again.')
  // RFC 9207: when the server names itself, it must be the issuer we asked.
  const iss = params.get('iss')
  if (iss !== null && iss.replace(/\/$/, '') !== expected.issuer.replace(/\/$/, ''))
    throw new SignInError('issuer_mismatch', 'Sign-in was answered by another server.')
  const error = params.get('error')
  if (error) throw new SignInError(error, params.get('error_description') ?? `Sign-in failed: ${error}`)
  const code = params.get('code')
  if (!code) throw new SignInError('missing_code', 'Sign-in returned no authorization code.')
  return code
}

export function codeGrant(
  server: AuthorizationServer,
  request: { clientId: string; redirectUri: string; code: string; verifier: string },
): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    code: request.code,
    redirect_uri: request.redirectUri,
    client_id: request.clientId,
    code_verifier: request.verifier,
    resource: resourceOf(server.issuer),
  })
}

export function refreshGrant(
  server: AuthorizationServer,
  request: { clientId: string; refreshToken: string },
): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: request.refreshToken,
    client_id: request.clientId,
    resource: resourceOf(server.issuer),
  })
}

export function keep(previous: Tokens | undefined, response: TokenResponse, now: number): Tokens {
  if (typeof response.access_token !== 'string' || !response.access_token)
    throw new SignInError('invalid_token_response', 'The token response had no access token.')
  return {
    accessToken: response.access_token,
    // Theorem rotates refresh tokens; keep the old one only if none came back.
    refreshToken: response.refresh_token ?? previous?.refreshToken,
    expiresAt:
      typeof response.expires_in === 'number' ? Math.floor(now / 1000) + response.expires_in : undefined,
  }
}

/** Refresh this long before the access token expires. */
export const REFRESH_MARGIN_SECONDS = 60

export const needsRefresh = (tokens: Tokens, now: number) =>
  tokens.expiresAt !== undefined && tokens.expiresAt - REFRESH_MARGIN_SECONDS <= Math.floor(now / 1000)

export const expired = (tokens: Tokens, now: number) =>
  tokens.expiresAt !== undefined && tokens.expiresAt <= Math.floor(now / 1000)

/**
 * Whether a failed token request means the grant itself is refused, so the
 * session is over (RFC 6749 section 5.2; Theorem answers invalid_grant or
 * invalid_client). A server error, rate limiting or an answer that is not
 * OAuth may pass, so the session is kept for a later try.
 */
export const endsSession = (error: unknown) =>
  error instanceof SignInError && ['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(error.code)
