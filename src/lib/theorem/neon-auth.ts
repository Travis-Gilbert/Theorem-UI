// SOURCING: @neon/auth BetterAuthVanillaAdapter (Neon's Better Auth client, whose OAuth provider plugin carries the signed authorization query on sign-in and follows the redirect it returns)
//
// The Neon Auth client for the pages Neon sends a person to while Theorem's
// issuer signs them in with email: the login page and the consent page. It
// talks to Neon through this origin's proxy (src/routes/auth/neon.$.ts), so
// its cookie is first-party.
//
// This is what `createAuthClient(url)` from '@neon/auth' returns, built from
// '@neon/auth/vanilla': the package root's type declarations redeclare the
// global `Bun` as `{ version?: string }`, which hides Bun's own types from
// every file in this project.
//
// The adapter must never reach the server bundle. Its module calls
// crypto.randomUUID() at the top level, which the Workers runtime refuses in
// global scope, and the server bundle loads its library chunk at startup, so
// the whole Worker would fail to start. createClientOnlyFn strips this body
// from the server build, which drops the import with it.
import { createClientOnlyFn } from '@tanstack/react-start'
import { BetterAuthVanillaAdapter } from '@neon/auth/vanilla'

let client:
  | ReturnType<
      ReturnType<
        ReturnType<typeof BetterAuthVanillaAdapter>
      >['getBetterAuthInstance']
    >
  | undefined

/** Browser only: the client is bound to this page's origin. */
export const neonAuth = createClientOnlyFn(() => {
  client ??= BetterAuthVanillaAdapter()(
    `${window.location.origin}/auth/neon`,
  ).getBetterAuthInstance()
  return client
})

/**
 * Whether this page was reached with Neon's signed authorization query, which
 * the client sends back when the person signs in or consents.
 */
export const hasAuthorizationQuery = (search: string) =>
  new URLSearchParams(search).has('sig')
