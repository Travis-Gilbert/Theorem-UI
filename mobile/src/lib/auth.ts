// SOURCING: expo-web-browser openAuthSessionAsync (ASWebAuthenticationSession; preferUniversalLinks selects its HTTPS callback, iOS 17.4+), expo-secure-store (Keychain), expo-crypto (CSPRNG, SHA-256); protocol steps in oauth.ts
//
// The phone holds the person's Theorem authorization and nothing else: tokens
// sit in the Keychain, are sent only to the configured authority, and never
// enter the conversation journal or any log.
import { useSyncExternalStore } from 'react'
import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'
import { config } from './config'
import {
  authorizeUrl,
  base64url,
  codeGrant,
  endsSession,
  expired,
  keep,
  needsRefresh,
  pkceChallenge,
  readCallback,
  refreshGrant,
  SignInError,
  type AuthorizationServer,
  type TokenResponse,
  type Tokens,
} from './oauth'

type Stored = Tokens & {
  authority: string
  /** "oauth" is a person's sign-in; "token" is a development bearer. */
  kind: 'oauth' | 'token'
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; reason?: string }
  | { status: 'signed-in'; kind: Stored['kind'] }

const KEY = 'theorem.session'
const keychain: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
}

let state: AuthState = { status: 'loading' }
let stored: Stored | undefined
/** Counts sign-ins and sign-outs, so work started for an earlier session is discarded. */
let session = 0
const listeners = new Set<() => void>()

function set(next: AuthState) {
  state = next
  for (const listener of listeners) listener()
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

async function persist(next: Stored | undefined) {
  stored = next
  if (next) await SecureStore.setItemAsync(KEY, JSON.stringify(next), keychain)
  else await SecureStore.deleteItemAsync(KEY, keychain)
}

/** A sign-in or sign-out: a renewal still in flight for the old session is not saved. */
function replace(next: Stored | undefined) {
  session += 1
  return persist(next)
}

/** Reads the Keychain once at launch. A session for another authority is ignored. */
export async function restore(): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(KEY, keychain)
    const value = raw ? (JSON.parse(raw) as Stored) : undefined
    stored = value?.authority === config.authority ? value : undefined
  } catch {
    stored = undefined
  }
  set(stored ? { status: 'signed-in', kind: stored.kind } : { status: 'signed-out' })
}

let metadata: Promise<AuthorizationServer> | undefined

function authorizationServer(): Promise<AuthorizationServer> {
  metadata ??= fetch(`${config.authority}/.well-known/oauth-authorization-server`, {
    headers: { accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Discovery failed (${response.status})`)
      const document = (await response.json()) as Partial<AuthorizationServer>
      if (
        document.issuer?.replace(/\/$/, '') !== config.authority ||
        !document.authorization_endpoint ||
        !document.token_endpoint
      )
        throw new Error('The authority published unusable OAuth metadata')
      return document as AuthorizationServer
    })
    .catch((error: unknown) => {
      metadata = undefined
      throw error
    })
  return metadata
}

async function tokenRequest(server: AuthorizationServer, body: URLSearchParams) {
  const response = await fetch(server.token_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: body.toString(),
  })
  const payload = (await response.json().catch(() => ({}))) as TokenResponse & {
    error?: string
    error_description?: string
  }
  if (!response.ok)
    throw new SignInError(
      payload.error ?? `http_${response.status}`,
      payload.error_description ?? `The token request was refused (${response.status}).`,
    )
  return payload
}

/** Opens the system sign-in sheet; resolves once tokens are stored or throws why not. */
export async function signIn(): Promise<void> {
  const server = await authorizationServer()
  const verifier = base64url(Crypto.getRandomBytes(32))
  const state = base64url(Crypto.getRandomBytes(16))
  const challenge = await pkceChallenge(verifier, (data) =>
    Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data),
  )
  const result = await WebBrowser.openAuthSessionAsync(
    authorizeUrl(server, {
      clientId: config.oauthClientId,
      redirectUri: config.oauthRedirectUri,
      state,
      challenge,
    }),
    config.oauthRedirectUri,
    { preferUniversalLinks: true },
  )
  if (result.type !== 'success') throw new SignInError('cancelled', 'Sign-in was closed before it finished.')
  const code = readCallback(result.url, {
    redirectUri: config.oauthRedirectUri,
    state,
    issuer: server.issuer,
  })
  const tokens = keep(
    undefined,
    await tokenRequest(
      server,
      codeGrant(server, {
        clientId: config.oauthClientId,
        redirectUri: config.oauthRedirectUri,
        code,
        verifier,
      }),
    ),
    Date.now(),
  )
  await replace({ ...tokens, authority: config.authority, kind: 'oauth' })
  set({ status: 'signed-in', kind: 'oauth' })
}

/**
 * Development builds only: a bearer from the authority's operator, for testing
 * before this app's OAuth client is registered. It names whoever the token
 * names, which may be no person.
 */
export async function signInWithDevelopmentToken(token: string): Promise<void> {
  if (!__DEV__) throw new Error('Development tokens are not accepted in release builds')
  await replace({ accessToken: token.trim(), authority: config.authority, kind: 'token' })
  set({ status: 'signed-in', kind: 'token' })
}

export async function signOut(reason?: string): Promise<void> {
  await replace(undefined)
  set({ status: 'signed-out', reason })
}

/** "ended": the server refused the refresh token. "unavailable": it could not be asked. */
type Renewed = Stored | 'ended' | 'unavailable'

let renewing: { session: number; result: Promise<Renewed> } | undefined

async function renew(current: Stored, started: number): Promise<Renewed> {
  if (!current.refreshToken) return 'ended'
  try {
    const server = await authorizationServer()
    const response = await tokenRequest(
      server,
      refreshGrant(server, { clientId: config.oauthClientId, refreshToken: current.refreshToken }),
    )
    // Signed out, or signed in again, while this was in flight: these tokens belong to no session.
    if (session !== started) return 'unavailable'
    const next: Stored = { ...keep(current, response, Date.now()), authority: current.authority, kind: current.kind }
    await persist(next)
    return next
  } catch (error) {
    return endsSession(error) ? 'ended' : 'unavailable'
  }
}

/**
 * The bearer for the next request, refreshed shortly before it expires. One
 * refresh runs at a time for a session: Theorem rotates refresh tokens, so a
 * second use of the same one would be refused.
 */
export async function bearer(): Promise<string | undefined> {
  const current = stored
  if (!current) return undefined
  if (current.kind === 'token' || !needsRefresh(current, Date.now())) return current.accessToken
  const started = session
  if (renewing?.session !== started) {
    const result = renew(current, started)
    renewing = { session: started, result }
    void result.finally(() => {
      if (renewing?.result === result) renewing = undefined
    })
  }
  const outcome = await renewing.result
  // The session changed while renewing: answer for the session there is now.
  if (session !== started) return bearer()
  if (outcome === 'ended') {
    await signOut('Your Theorem session ended. Sign in again.')
    return undefined
  }
  if (outcome === 'unavailable') {
    // Inside the margin the token still works. Once it has expired, Theorem
    // would refuse it, and that refusal would end the session.
    if (expired(current, Date.now())) throw new Error('Theorem could not renew your sign-in. Try again shortly.')
    return current.accessToken
  }
  return outcome.accessToken
}
