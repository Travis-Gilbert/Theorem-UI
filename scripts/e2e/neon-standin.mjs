// SOURCING: better-auth with @better-auth/oauth-provider, the library Neon Auth manages, so the local sign-in runs the same authorization server code as the hosted one; better-auth/node serves it.
//
// A Neon Auth stand-in on this machine. Neon Auth is managed Better Auth with
// its OAuth provider plugin; this is that server, mounted at the path a Neon
// branch uses, with its cookies named the way Neon names them, so the UI's
// same-origin proxy and login page cannot tell the difference. Accounts live in
// memory and are seeded at start:
//
//   claude-e2e   bound to the claude-e2e tenant by the stack
//   stranger     bound to nothing, so the issuer must refuse it
//
// What the stack needs (issuer, the issuer's client, the seeded user ids) is
// written to E2E_NEON_STATE, readable only by this user.
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { oauthProvider } from '@better-auth/oauth-provider'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { getSchema } from 'better-auth/db'
import { toNodeHandler } from 'better-auth/node'
import { jwt } from 'better-auth/plugins'

const env = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

const origin = env('E2E_NEON_ORIGIN')
const ui = env('E2E_NEON_UI')
const issuerCallback = env('E2E_ISSUER_CALLBACK')
const accounts = JSON.parse(env('E2E_NEON_ACCOUNTS'))
const BASE_PATH = '/neondb/auth'

const options = {
  baseURL: origin,
  basePath: BASE_PATH,
  secret: env('E2E_NEON_SECRET'),
  emailAndPassword: { enabled: true },
  trustedOrigins: [ui],
  // Neon's cookie names, which the @neon/auth proxy forwards and no others.
  advanced: { cookiePrefix: 'neon-auth', useSecureCookies: true },
  plugins: [
    jwt(),
    oauthProvider({
      loginPage: `${ui}/auth/email`,
      consentPage: `${ui}/auth/consent`,
    }),
  ],
}
// The memory adapter needs every table the plugins declare before first use.
const tables = Object.keys(getSchema(options))
const auth = betterAuth({
  ...options,
  database: memoryAdapter(Object.fromEntries(tables.map((name) => [name, []]))),
})

const handler = toNodeHandler(auth)
const port = Number(new URL(origin).port)
createServer((request, response) => {
  if (request.url === '/health') return response.end('ok')
  return handler(request, response)
}).listen(port, '127.0.0.1')

const ids = {}
for (const [name, account] of Object.entries(accounts)) {
  const { user } = await auth.api.signUpEmail({
    body: { name, email: account.email, password: account.password },
  })
  ids[name] = user.id
}

// What the issuer holds at Neon: a confidential first-party client that skips
// the consent screen, as the production setup asks for. Registering one needs a
// signed-in user, as the Neon console has; an operator account stands in for it.
const operator = await auth.api.signUpEmail({
  body: {
    name: 'operator',
    email: 'operator@e2e.test',
    password: randomBytes(24).toString('hex'),
  },
  returnHeaders: true,
})
const cookie = operator.headers
  .getSetCookie()
  .map((line) => line.split(';')[0])
  .join('; ')
const client = await auth.api.adminCreateOAuthClient({
  headers: new Headers({ cookie }),
  body: {
    client_name: 'Theorem issuer (end to end)',
    redirect_uris: [issuerCallback],
    token_endpoint_auth_method: 'client_secret_basic',
    // Better Auth gives web clients https callbacks only; on this machine the
    // issuer's callback is http on loopback, which it allows a native client.
    // Production registers a web client for the https callback.
    application_type: 'native',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    skip_consent: true,
  },
})

writeFileSync(
  env('E2E_NEON_STATE'),
  JSON.stringify({
    issuer: `${origin}${BASE_PATH}`,
    clientId: client.client_id,
    clientSecret: client.client_secret,
    users: ids,
  }),
  { mode: 0o600 },
)
console.log(`Neon Auth stand-in at ${origin}${BASE_PATH}`)
