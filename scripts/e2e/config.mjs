// Where the local end-to-end stack lives. Every address is on this machine.
import { homedir } from 'node:os'
import { join } from 'node:path'

const port = (name, fallback) => Number(process.env[name] ?? fallback)

export const UI_PORT = port('E2E_UI_PORT', 3102)
export const API_PORT = port('E2E_API_PORT', 8392)
export const IDENTITY_PORT = port('E2E_IDENTITY_PORT', 8398)
export const STANDIN_PORT = port('E2E_STANDIN_PORT', 8399)
export const NEON_PORT = port('E2E_NEON_PORT', 8397)

export const UI = `http://localhost:${UI_PORT}`
export const API = `http://127.0.0.1:${API_PORT}`
export const IDENTITY = `http://127.0.0.1:${IDENTITY_PORT}`
export const STANDIN = `http://127.0.0.1:${STANDIN_PORT}`
export const NEON = `http://127.0.0.1:${NEON_PORT}`

/**
 * How people sign in. `oidc` (the default) is the local OpenID provider in
 * identity.mjs. `neon` is production's pair: GitHub beside email through a
 * Neon Auth stand-in (neon-standin.mjs), with the test account bound to its
 * tenant and a second email account that is bound to nothing.
 */
export const IDENTITY_MODE =
  process.env.E2E_IDENTITY === 'neon' ? 'neon' : 'oidc'

/** The Neon stand-in's email accounts, by name. */
export const NEON_ACCOUNTS = {
  'claude-e2e': 'claude-e2e@e2e.test',
  stranger: 'stranger@e2e.test',
}

/** Secrets, the store and logs. Outside the repo, so nothing here can be committed. */
export const DATA_DIR =
  process.env.E2E_DATA_DIR ?? join(homedir(), '.theorem', 'e2e')

/** The test account. Its first sign-in provisions a tenant of this name. */
export const ACCOUNT = 'claude-e2e'
