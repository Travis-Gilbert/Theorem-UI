// SOURCING: oidc-provider (panva), with its own development login page. Theorem's issuer takes any OpenID provider, so this stands where GitHub does in production and the rest of the sign-in path is the real one.
//
// Local only. The development login accepts any name and password, which is
// why this binds to loopback and is never deployed.
import Provider from 'oidc-provider'
import { IDENTITY, IDENTITY_PORT } from './config.mjs'

const identity = new Provider(IDENTITY, {
  clients: [
    {
      client_id: process.env.E2E_IDENTITY_CLIENT_ID,
      client_secret: process.env.E2E_IDENTITY_CLIENT_SECRET,
      redirect_uris: [process.env.E2E_ISSUER_CALLBACK],
      grant_types: ['authorization_code'],
      response_types: ['code'],
    },
  ],
  cookies: { keys: [process.env.E2E_IDENTITY_COOKIE_KEY] },
  features: { devInteractions: { enabled: true } },
  // Theorem's issuer sends a client secret upstream rather than PKCE.
  pkce: { required: () => false },
  claims: {
    openid: ['sub'],
    profile: ['preferred_username', 'name'],
    email: ['email'],
  },
  findAccount: (_context, id) => ({
    accountId: id,
    claims: () => ({
      sub: id,
      preferred_username: id,
      name: id,
      email: `${id}@e2e.test`,
    }),
  }),
})

identity.listen(IDENTITY_PORT, '127.0.0.1')
