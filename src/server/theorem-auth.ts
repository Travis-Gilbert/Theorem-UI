// SOURCING: oauth4webapi (authorization code with PKCE and refresh against Theorem's OAuth server), iron-session 9 over TanStack Start's getCookie/setCookie (the sealed session cookie, as start-server-core's guide recommends)
//
// Signs a person in to Theorem and keeps their tokens in a sealed, HttpOnly
// cookie, so the proxy can call Theorem as that person. The tokens never reach
// browser script. Without THEOREM_OAUTH_CLIENT_ID the UI keeps the deployment
// token (THEOREM_API_TOKEN), which names no person.
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { getIronSession } from 'iron-session'
import * as oauth from 'oauth4webapi'

type Session = {
  accessToken?: string
  refreshToken?: string
  /** Seconds since the epoch. */
  expiresAt?: number
  /** The sign-in in progress, between the redirect out and the callback. */
  pending?: { state: string; verifier: string; returnTo: string }
}

/**
 * Chat and run routes accept run:read and run:write in place of tenant:read
 * and tenant:write; starting a run also needs models:invoke, which Theorem
 * grants only to clients configured with it.
 */
const SCOPE = 'run:read run:write models:invoke'

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_SECONDS = 60

type Config = {
  issuer: URL
  client: oauth.Client
  clientAuth: oauth.ClientAuth
  password: string
}

export function oauthConfigured() {
  return Boolean(process.env.THEOREM_OAUTH_CLIENT_ID)
}

/** The configuration, or what is missing from it. */
function config(): Config | string {
  const issuer = process.env.THEOREM_OAUTH_ISSUER || process.env.THEOREM_API_URL
  const clientId = process.env.THEOREM_OAUTH_CLIENT_ID
  const secret = process.env.THEOREM_OAUTH_CLIENT_SECRET
  const password = process.env.THEOREM_SESSION_SECRET
  if (!issuer || !clientId)
    return 'Set THEOREM_API_URL and THEOREM_OAUTH_CLIENT_ID.'
  if (!password || password.length < 32)
    return 'Set THEOREM_SESSION_SECRET to at least 32 random characters.'
  return {
    issuer: new URL(issuer),
    client: { client_id: clientId },
    clientAuth: secret ? oauth.ClientSecretPost(secret) : oauth.None(),
    password,
  }
}

/** Plain HTTP is allowed only where Theorem allows it: a loopback server. */
function httpOptions(url: URL) {
  return { [oauth.allowInsecureRequests]: url.protocol === 'http:' }
}

// Theorem's metadata comes from configuration, not from any request.
let metadata: Promise<oauth.AuthorizationServer> | undefined

function authorizationServer({ issuer }: Config) {
  metadata ??= oauth
    .discoveryRequest(issuer, { algorithm: 'oauth2', ...httpOptions(issuer) })
    .then((response) => oauth.processDiscoveryResponse(issuer, response))
    .catch((error: unknown) => {
      metadata = undefined
      throw error
    })
  return metadata
}

/** Theorem binds tokens to its MCP resource. */
const resourceOf = (as: oauth.AuthorizationServer) =>
  `${as.issuer.replace(/\/$/, '')}/mcp`

const callbackUrl = (request: Request) =>
  new URL('/auth/callback', request.url).href

function session({ password }: Config) {
  return getIronSession<Session>(
    { read: getCookie, write: setCookie },
    {
      cookieName: 'theorem_session',
      password,
      ttl: 30 * 24 * 60 * 60,
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      },
    },
  )
}

function keep(target: Session, tokens: oauth.TokenEndpointResponse) {
  target.accessToken = tokens.access_token
  if (tokens.refresh_token) target.refreshToken = tokens.refresh_token
  target.expiresAt = tokens.expires_in
    ? Math.floor(Date.now() / 1000) + tokens.expires_in
    : undefined
}

/**
 * Only paths on this origin; anything else returns to the start. The path is
 * resolved rather than matched, because browsers read `/\host` and a path with
 * a tab after its slash as `//host`.
 */
export function safeReturnTo(value: string | null, request: Request) {
  const origin = new URL(request.url).origin
  if (!value?.startsWith('/')) return '/'
  const target = new URL(value, origin)
  return target.origin === origin
    ? target.pathname + target.search + target.hash
    : '/'
}

const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { location } })

function unconfigured(detail: string) {
  return Response.json(
    { title: 'Sign-in is not configured', status: 503, detail },
    { status: 503, headers: { 'content-type': 'application/problem+json' } },
  )
}

export async function signIn(request: Request) {
  const settings = config()
  if (typeof settings === 'string') return unconfigured(settings)
  const as = await authorizationServer(settings)
  const verifier = oauth.generateRandomCodeVerifier()
  const state = oauth.generateRandomState()
  const current = await session(settings)
  current.pending = {
    state,
    verifier,
    returnTo: safeReturnTo(
      new URL(request.url).searchParams.get('returnTo'),
      request,
    ),
  }
  await current.save()

  const authorize = new URL(as.authorization_endpoint!)
  authorize.search = new URLSearchParams({
    response_type: 'code',
    client_id: settings.client.client_id,
    redirect_uri: callbackUrl(request),
    scope: SCOPE,
    state,
    code_challenge: await oauth.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    resource: resourceOf(as),
  }).toString()
  return redirect(authorize.href)
}

export async function signInCallback(request: Request) {
  const settings = config()
  if (typeof settings === 'string') return unconfigured(settings)
  const as = await authorizationServer(settings)
  const current = await session(settings)
  const pending = current.pending
  if (!pending) return redirect('/?signin_error=expired')
  current.pending = undefined
  try {
    const parameters = oauth.validateAuthResponse(
      as,
      settings.client,
      new URL(request.url),
      pending.state,
    )
    const response = await oauth.authorizationCodeGrantRequest(
      as,
      settings.client,
      settings.clientAuth,
      parameters,
      callbackUrl(request),
      pending.verifier,
      {
        additionalParameters: { resource: resourceOf(as) },
        ...httpOptions(new URL(as.token_endpoint!)),
      },
    )
    keep(
      current,
      await oauth.processAuthorizationCodeResponse(
        as,
        settings.client,
        response,
      ),
    )
  } catch (error) {
    await current.save()
    const code =
      error instanceof oauth.AuthorizationResponseError ||
      error instanceof oauth.ResponseBodyError
        ? error.error
        : 'failed'
    return redirect(`/?signin_error=${encodeURIComponent(code)}`)
  }
  await current.save()
  return redirect(pending.returnTo)
}

export async function signOut() {
  const settings = config()
  if (typeof settings === 'string') return unconfigured(settings)
  ;(await session(settings)).destroy()
  return new Response(null, { status: 204 })
}

// Theorem rotates refresh tokens, so two requests refreshing with the same
// one would see the second refused. Each refresh is shared by every request
// carrying that refresh token, and its result is kept for a minute for
// requests that still carry the cookie from before it.
const refreshes = new Map<string, Promise<oauth.TokenEndpointResponse>>()

function refresh(settings: Config, refreshToken: string) {
  let pending = refreshes.get(refreshToken)
  if (!pending) {
    pending = authorizationServer(settings).then(async (as) =>
      oauth.processRefreshTokenResponse(
        as,
        settings.client,
        await oauth.refreshTokenGrantRequest(
          as,
          settings.client,
          settings.clientAuth,
          refreshToken,
          {
            additionalParameters: { resource: resourceOf(as) },
            ...httpOptions(new URL(as.token_endpoint!)),
          },
        ),
      ),
    )
    refreshes.set(refreshToken, pending)
    // A failed refresh is not kept, so the next request tries again.
    pending.then(
      () => setTimeout(() => refreshes.delete(refreshToken), 60_000),
      () => refreshes.delete(refreshToken),
    )
  }
  return pending
}

/**
 * The signed-in person's access token, refreshed when it is about to expire;
 * undefined when nobody is signed in or the session can no longer refresh.
 */
export async function personBearer(): Promise<string | undefined> {
  const settings = config()
  if (typeof settings === 'string') throw new Error(settings)
  const current = await session(settings)
  if (!current.accessToken) return undefined
  const now = Math.floor(Date.now() / 1000)
  if (!current.expiresAt || current.expiresAt - REFRESH_MARGIN_SECONDS > now)
    return current.accessToken
  if (!current.refreshToken) {
    current.destroy()
    return undefined
  }
  try {
    keep(current, await refresh(settings, current.refreshToken))
  } catch (error) {
    // While Theorem is unreachable (a deploy, say) the session stays and a
    // later request refreshes it. A refused refresh token signs the person
    // out without clearing the cookie: Theorem rotates refresh tokens, so the
    // refusal may be a request that lost a race with a refresh another worker
    // made, and an emptied cookie would overwrite the one that refresh set.
    return error instanceof oauth.ResponseBodyError
      ? undefined
      : current.accessToken
  }
  await current.save()
  return current.accessToken
}
