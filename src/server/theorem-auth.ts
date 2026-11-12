// SOURCING: oauth4webapi (authorization code with PKCE and refresh against Theorem's OAuth server), iron-session 9 over TanStack Start's getCookie/setCookie (the sealed session cookie, as start-server-core's guide recommends)
//
// Signs a person in to Theorem and keeps their tokens in a sealed, HttpOnly
// cookie, so the proxy can call Theorem as that person. The tokens never reach
// browser script. Without THEOREM_OAUTH_CLIENT_ID the UI keeps the deployment
// token (THEOREM_API_TOKEN), which names no person.
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { getIronSession } from 'iron-session'
import * as oauth from 'oauth4webapi'
import { loginFailureHref, safeReturnTo } from '../lib/theorem/auth-navigation'

type Session = {
  accessToken?: string
  refreshToken?: string
  /** The scopes this session was granted, space separated. */
  scope?: string
  /** Seconds since the epoch. */
  expiresAt?: number
  /** The sign-in in progress, between the redirect out and the callback. */
  pending?: {
    state: string
    verifier: string
    returnTo: string
    startedAt?: number
  }
  /**
   * A sign-in with a code in progress: this browser polls while the person
   * approves the code in another browser. The device code never leaves here.
   */
  device?: {
    deviceCode: string
    returnTo: string
    /** Milliseconds since the epoch. */
    expiresAt: number
    /** Seconds between polls. */
    interval: number
  }
}

/** A way to sign in that Theorem's issuer offers, such as GitHub or email. */
export type IdentityProvider = { id: string; name: string }

export type SignInOptions = {
  /** Empty when the issuer names none and asks the person itself. */
  providers: IdentityProvider[]
  /** Whether Theorem's issuer offers sign-in with a code. */
  codeSignIn: boolean
}

export type CodeSignIn = {
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
  /** Milliseconds since the epoch. */
  expiresAt: number
  /** Seconds between polls. */
  interval: number
}

export type CodeSignInStatus =
  | { status: 'pending'; interval: number }
  | { status: 'signed_in'; returnTo: string }
  | { status: 'denied' | 'expired' }
  // Theorem could not be reached. The code is kept, so polling goes on at
  // the interval, when this poll got far enough to know it.
  | { status: 'unavailable'; interval?: number }

/**
 * Chat and run routes accept run:read and run:write in place of tenant:read
 * and tenant:write; starting a run also needs models:invoke, which Theorem
 * grants only to clients configured with it. The canvas calls native tools,
 * which sit behind graph:read, and programs and life doors write under
 * graph:write.
 */
const THEOREM_SCOPE =
  'run:read run:write models:invoke graph:read graph:write agency:approve'

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_SECONDS = 60

type Config = {
  issuer: URL
  client: oauth.Client
  clientAuth: oauth.ClientAuth
  password: string
  /**
   * What a sign-in asks for, space separated. Theorem's own issuer grants
   * Theorem's scopes; another issuer (WorkOS AuthKit, say) is asked for its
   * own, and Theorem decides what the person may do from who they are.
   */
  scope: string
  /** The resource tokens are bound to; the issuer's /mcp when unset. */
  resource?: string
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
    scope:
      process.env.THEOREM_OAUTH_SCOPE?.split(/\s+/).filter(Boolean).join(' ') ||
      THEOREM_SCOPE,
    resource: process.env.THEOREM_OAUTH_RESOURCE || undefined,
  }
}

/** Plain HTTP is allowed only where Theorem allows it: a loopback server. */
function httpOptions(url: URL) {
  return { [oauth.allowInsecureRequests]: url.protocol === 'http:' }
}

// An issuer's metadata comes from configuration, not from any request.
const metadata = new Map<string, Promise<oauth.AuthorizationServer>>()

function authorizationServer({ issuer }: Config) {
  let found = metadata.get(issuer.href)
  if (!found) {
    found = oauth
      .discoveryRequest(issuer, { algorithm: 'oauth2', ...httpOptions(issuer) })
      .then((response) => oauth.processDiscoveryResponse(issuer, response))
      .catch((error: unknown) => {
        metadata.delete(issuer.href)
        throw error
      })
    metadata.set(issuer.href, found)
  }
  return found
}

/**
 * Theorem binds tokens to its MCP resource. Its own issuer serves that
 * resource beside itself; an issuer elsewhere is told where it is.
 */
const resourceOf = ({ resource }: Config, as: oauth.AuthorizationServer) =>
  resource ?? `${as.issuer.replace(/\/$/, '')}/mcp`

/**
 * The ways in the issuer's metadata offers, in its order. The list is
 * Theorem's own `theorem_identity_providers` member; anything malformed in it
 * is skipped. An issuer that lists none asks the person on its own page.
 */
function identityProvidersOf(
  as: oauth.AuthorizationServer,
): IdentityProvider[] {
  const listed = as.theorem_identity_providers
  if (!Array.isArray(listed)) return []
  return listed.flatMap((entry) =>
    entry &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    typeof entry.id === 'string' &&
    typeof entry.name === 'string'
      ? [{ id: entry.id, name: entry.name }]
      : [],
  )
}

export async function signInOptions(): Promise<SignInOptions> {
  const settings = config()
  if (typeof settings === 'string') return { providers: [], codeSignIn: false }
  try {
    const as = await authorizationServer(settings)
    return {
      providers: identityProvidersOf(as),
      codeSignIn: Boolean(as.device_authorization_endpoint),
    }
  } catch {
    // Sign-in reports the outage when it is chosen.
    return { providers: [], codeSignIn: false }
  }
}

const callbackUrl = (request: Request) =>
  new URL('/auth/callback', request.url).href

function session({ password }: Config) {
  return getIronSession<Session>(
    { read: getCookie, write: setCookie },
    {
      // Cookies are kept per host, not per port, so a local stack beside
      // another on localhost names its own cookie (scripts/e2e/stack.mjs).
      cookieName: process.env.THEOREM_SESSION_COOKIE || 'theorem_session',
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

/** A response that names no scope granted what was asked (RFC 6749, 5.1). */
function keep(
  target: Session,
  tokens: oauth.TokenEndpointResponse,
  asked: string,
) {
  target.accessToken = tokens.access_token
  target.scope = tokens.scope ?? target.scope ?? asked
  if (tokens.refresh_token) target.refreshToken = tokens.refresh_token
  target.expiresAt = tokens.expires_in
    ? Math.floor(Date.now() / 1000) + tokens.expires_in
    : undefined
}

const redirect = (location: string) =>
  new Response(null, {
    status: 302,
    headers: {
      location,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  })

/** Upgrade before writing a Secure cookie or deriving the registered callback. */
function requireSecureAuth(request: Request): Response | undefined {
  const url = new URL(request.url)
  if (
    url.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    url.protocol = 'https:'
    return redirect(url.href)
  }
}

function unconfigured(detail: string) {
  return Response.json(
    { title: 'Sign-in is not configured', status: 503, detail },
    { status: 503, headers: { 'content-type': 'application/problem+json' } },
  )
}

export async function signIn(request: Request) {
  const upgrade = requireSecureAuth(request)
  if (upgrade) return upgrade
  const query = new URL(request.url).searchParams
  const returnTo = safeReturnTo(query.get('returnTo'))
  const settings = config()
  if (typeof settings === 'string')
    return redirect(loginFailureHref('configuration', returnTo))
  try {
    const as = await authorizationServer(settings)
    // Only a provider the issuer offers is passed on; anything else signs in
    // with the issuer's first.
    const chosen = query.get('identity_provider')
    const provider = identityProvidersOf(as).find(({ id }) => id === chosen)
    const verifier = oauth.generateRandomCodeVerifier()
    const state = oauth.generateRandomState()
    const current = await session(settings)
    current.pending = {
      state,
      verifier,
      returnTo,
      startedAt: Date.now(),
    }
    await current.save()

    const authorize = new URL(as.authorization_endpoint!)
    authorize.search = new URLSearchParams({
      response_type: 'code',
      client_id: settings.client.client_id,
      redirect_uri: callbackUrl(request),
      scope: settings.scope,
      state,
      code_challenge: await oauth.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      resource: resourceOf(settings, as),
      ...(provider && { identity_provider: provider.id }),
    }).toString()
    return redirect(authorize.href)
  } catch {
    return redirect(loginFailureHref('unavailable', returnTo))
  }
}

export async function signInCallback(request: Request) {
  const upgrade = requireSecureAuth(request)
  if (upgrade) return upgrade
  const settings = config()
  if (typeof settings === 'string')
    return redirect(loginFailureHref('configuration'))
  const current = await session(settings)
  const pending = current.pending
  if (!pending) return redirect(loginFailureHref('expired'))
  current.pending = undefined
  if (pending.startedAt && Date.now() - pending.startedAt > 10 * 60 * 1000) {
    await current.save()
    return redirect(loginFailureHref('expired', pending.returnTo))
  }
  // Check before discovery so an invalid callback cannot consume a token code.
  if (new URL(request.url).searchParams.get('state') !== pending.state) {
    await current.save()
    return redirect(loginFailureHref('state_mismatch', pending.returnTo))
  }
  try {
    const as = await authorizationServer(settings)
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
        additionalParameters: { resource: resourceOf(settings, as) },
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
      settings.scope,
    )
  } catch (error) {
    await current.save()
    const code =
      error instanceof oauth.AuthorizationResponseError ||
      error instanceof oauth.ResponseBodyError
        ? error.error
        : 'failed'
    // Only known protocol codes become UI state; never echo provider details.
    const publicCode = [
      'access_denied',
      'invalid_grant',
      'invalid_client',
      'unauthorized_client',
      'invalid_scope',
    ].includes(code)
      ? code
      : 'failed'
    return redirect(loginFailureHref(publicCode, pending.returnTo))
  }
  await current.save()
  return redirect(safeReturnTo(pending.returnTo))
}

export async function signOut() {
  const settings = config()
  if (typeof settings === 'string') return unconfigured(settings)
  ;(await session(settings)).destroy()
  return new Response(null, { status: 204 })
}

/**
 * Starts a sign-in with a code (RFC 8628) for a browser that cannot sign in
 * itself, such as an agent's. The person opens the code's page in a browser
 * where they can sign in; this browser keeps the device code in its sealed
 * cookie and polls with it.
 */
export async function startCodeSignIn(
  returnToRequested: string | undefined,
): Promise<CodeSignIn | undefined> {
  const settings = config()
  if (typeof settings === 'string') return undefined
  const as = await authorizationServer(settings)
  if (!as.device_authorization_endpoint) return undefined
  const granted = await oauth.processDeviceAuthorizationResponse(
    as,
    settings.client,
    await oauth.deviceAuthorizationRequest(
      as,
      settings.client,
      settings.clientAuth,
      { scope: settings.scope, resource: resourceOf(settings, as) },
      httpOptions(new URL(as.device_authorization_endpoint)),
    ),
  )
  const expiresAt = Date.now() + granted.expires_in * 1000
  const interval = granted.interval ?? 5
  const current = await session(settings)
  current.device = {
    deviceCode: granted.device_code,
    returnTo: safeReturnTo(returnToRequested),
    expiresAt,
    interval,
  }
  await current.save()
  return {
    userCode: granted.user_code,
    verificationUri: granted.verification_uri,
    verificationUriComplete: granted.verification_uri_complete,
    expiresAt,
    interval,
  }
}

/** One poll of the sign-in with a code this browser started. */
export async function pollCodeSignIn(): Promise<CodeSignInStatus> {
  const settings = config()
  if (typeof settings === 'string') return { status: 'unavailable' }
  const current = await session(settings)
  const device = current.device
  if (!device || device.expiresAt <= Date.now()) {
    if (device) {
      current.device = undefined
      await current.save()
    }
    return { status: 'expired' }
  }
  let tokens: oauth.TokenEndpointResponse
  try {
    const as = await authorizationServer(settings)
    tokens = await oauth.processDeviceCodeResponse(
      as,
      settings.client,
      await oauth.deviceCodeGrantRequest(
        as,
        settings.client,
        settings.clientAuth,
        device.deviceCode,
        {
          additionalParameters: { resource: resourceOf(settings, as) },
          ...httpOptions(new URL(as.token_endpoint!)),
        },
      ),
    )
  } catch (error) {
    if (
      !(error instanceof oauth.ResponseBodyError) ||
      error.status >= 500 ||
      error.error === 'temporarily_unavailable'
    )
      return { status: 'unavailable', interval: device.interval }
    switch (error.error) {
      case 'authorization_pending':
        return { status: 'pending', interval: device.interval }
      case 'slow_down':
        device.interval += 5
        current.device = device
        await current.save()
        return { status: 'pending', interval: device.interval }
      default:
        current.device = undefined
        await current.save()
        return {
          status: error.error === 'access_denied' ? 'denied' : 'expired',
        }
    }
  }
  current.device = undefined
  keep(current, tokens, settings.scope)
  await current.save()
  return { status: 'signed_in', returnTo: device.returnTo }
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
            additionalParameters: { resource: resourceOf(settings, as) },
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
  // A session from before a scope was added cannot gain it by refreshing; a
  // sign-in grants the whole set.
  const granted = current.scope?.split(' ') ?? []
  if (!settings.scope.split(' ').every((scope) => granted.includes(scope))) {
    current.destroy()
    return undefined
  }
  const now = Math.floor(Date.now() / 1000)
  if (!current.expiresAt || current.expiresAt - REFRESH_MARGIN_SECONDS > now)
    return current.accessToken
  if (!current.refreshToken) {
    current.destroy()
    return undefined
  }
  try {
    keep(current, await refresh(settings, current.refreshToken), settings.scope)
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
