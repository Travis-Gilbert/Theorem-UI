// SOURCING: bun:test; RFC 7636 appendix B test vector
import { createHash } from 'node:crypto'
import { describe, expect, test } from 'bun:test'
import {
  authorizeUrl,
  base64url,
  codeGrant,
  keep,
  needsRefresh,
  pkceChallenge,
  readCallback,
  refreshGrant,
  resourceOf,
  SCOPE,
  SignInError,
  type AuthorizationServer,
} from './oauth'

const server: AuthorizationServer = {
  issuer: 'https://theorem.example',
  authorization_endpoint: 'https://theorem.example/oauth/authorize',
  token_endpoint: 'https://theorem.example/oauth/token',
}
const redirectUri = 'https://theorem.rs/auth/ios/callback'
const sha256 = async (data: Uint8Array<ArrayBuffer>) => {
  const digest = createHash('sha256').update(data).digest()
  return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength) as ArrayBuffer
}

describe('base64url', () => {
  test('matches the platform encoder for every remainder length', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 31, 32, 33]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) & 255)
      expect(base64url(bytes)).toBe(Buffer.from(bytes).toString('base64url'))
    }
  })
})

describe('pkce', () => {
  test('S256 challenge matches RFC 7636 appendix B', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', sha256)).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })
})

describe('authorize request', () => {
  test('carries client, PKCE, scope and the MCP resource', () => {
    const url = new URL(
      authorizeUrl(server, { clientId: 'theorem-ios', redirectUri, state: 'st', challenge: 'ch' }),
    )
    expect(url.origin + url.pathname).toBe(server.authorization_endpoint)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'theorem-ios',
      redirect_uri: redirectUri,
      scope: SCOPE,
      state: 'st',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      resource: 'https://theorem.example/mcp',
    })
  })

  test('resource ignores a trailing slash on the issuer', () => {
    expect(resourceOf('https://theorem.example/')).toBe('https://theorem.example/mcp')
  })
})

describe('callback', () => {
  const expected = { redirectUri, state: 'st', issuer: server.issuer }
  const code = (query: string) => readCallback(`${redirectUri}?${query}`, expected)
  const failure = (run: () => unknown) => {
    try {
      run()
    } catch (error) {
      expect(error).toBeInstanceOf(SignInError)
      return (error as SignInError).code
    }
    throw new Error('expected a SignInError')
  }

  test('returns the code for the matching request', () => {
    expect(code('code=abc&state=st&iss=https%3A%2F%2Ftheorem.example')).toBe('abc')
    expect(code('code=abc&state=st')).toBe('abc')
  })
  test('refuses another state', () => {
    expect(failure(() => code('code=abc&state=other'))).toBe('state_mismatch')
  })
  test('refuses another issuer (RFC 9207)', () => {
    expect(failure(() => code('code=abc&state=st&iss=https%3A%2F%2Fevil.example'))).toBe('issuer_mismatch')
  })
  test('refuses another redirect address', () => {
    expect(failure(() => readCallback('https://theorem.rs/other?code=abc&state=st', expected))).toBe(
      'redirect_mismatch',
    )
  })
  test('reports the server error', () => {
    expect(failure(() => code('error=access_denied&error_description=No&state=st'))).toBe('access_denied')
  })
  test('refuses a callback without a code', () => {
    expect(failure(() => code('state=st'))).toBe('missing_code')
  })
})

describe('token requests', () => {
  test('code grant sends the verifier and resource', () => {
    expect(
      Object.fromEntries(
        codeGrant(server, { clientId: 'theorem-ios', redirectUri, code: 'abc', verifier: 'v' }),
      ),
    ).toEqual({
      grant_type: 'authorization_code',
      code: 'abc',
      redirect_uri: redirectUri,
      client_id: 'theorem-ios',
      code_verifier: 'v',
      resource: 'https://theorem.example/mcp',
    })
  })
  test('refresh grant sends the refresh token and resource', () => {
    expect(Object.fromEntries(refreshGrant(server, { clientId: 'theorem-ios', refreshToken: 'r' }))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'r',
      client_id: 'theorem-ios',
      resource: 'https://theorem.example/mcp',
    })
  })
})

describe('keeping tokens', () => {
  const now = 1_000_000_000_000
  test('records expiry in seconds and takes a rotated refresh token', () => {
    expect(
      keep(
        { accessToken: 'old', refreshToken: 'r1' },
        { access_token: 'a', refresh_token: 'r2', expires_in: 3600 },
        now,
      ),
    ).toEqual({
      accessToken: 'a',
      refreshToken: 'r2',
      expiresAt: now / 1000 + 3600,
    })
  })
  test('keeps the previous refresh token when none is returned', () => {
    expect(keep({ accessToken: 'old', refreshToken: 'r1' }, { access_token: 'a' }, now).refreshToken).toBe(
      'r1',
    )
  })
  test('refuses a response without an access token', () => {
    expect(() => keep(undefined, {} as never, now)).toThrow(SignInError)
  })
  test('refreshes within the margin, not before', () => {
    const seconds = now / 1000
    expect(needsRefresh({ accessToken: 'a', expiresAt: seconds + 61 }, now)).toBe(false)
    expect(needsRefresh({ accessToken: 'a', expiresAt: seconds + 60 }, now)).toBe(true)
    expect(needsRefresh({ accessToken: 'a' }, now)).toBe(false)
  })
})
