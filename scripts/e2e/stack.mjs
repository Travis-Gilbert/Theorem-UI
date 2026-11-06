// A whole Theorem on this machine, signed in the way production is:
//
//   browser -> this UI -> Theorem's OAuth issuer -> a local OpenID provider
//
// The UI, its proxy, the issuer, the store, the agent and the Librarian are the
// real programs, and models are real calls through Theorem's catalog, using the
// keys in ~/.theorem/provider-keys.env. Only the identity provider is local.
//
//   E2E_SERVER_BIN=<path to rustyred-thg-server> node scripts/e2e/stack.mjs
//
// Then, in another shell: node scripts/e2e/review.mjs
// Generated secrets stay in E2E_DATA_DIR, in a file only this user can read.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import {
  ACCOUNT,
  API,
  API_PORT,
  DATA_DIR,
  IDENTITY,
  UI,
  UI_PORT,
} from './config.mjs'

const CLIENT_ID = 'theorem-ui-e2e'
const IDENTITY_CLIENT_ID = 'theorem-e2e'
const READY_ATTEMPTS = 240
const READY_INTERVAL_MS = 1_000

const root = resolve(import.meta.dirname, '../..')
const server = process.env.E2E_SERVER_BIN
if (!server || !existsSync(server)) {
  console.error('Set E2E_SERVER_BIN to a built rustyred-thg-server.')
  process.exit(1)
}

function secrets() {
  const path = join(DATA_DIR, 'secrets.json')
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  const hex = (bytes) => randomBytes(bytes).toString('hex')
  const fresh = {
    sessionSigningKey: hex(32),
    publicationSigningKey: hex(32),
    identityClientSecret: hex(24),
    identityCookieKey: hex(24),
    uiSessionSecret: hex(32),
  }
  writeFileSync(path, JSON.stringify(fresh), { mode: 0o600 })
  return fresh
}

function providerKeys() {
  const path = join(homedir(), '.theorem', 'provider-keys.env')
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {}
}

const children = []
function start(name, command, args, env) {
  const log = createWriteStream(join(DATA_DIR, 'logs', `${name}.log`), {
    flags: 'a',
  })
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.pipe(log)
  child.stderr.pipe(log)
  child.on('exit', (code) => {
    console.error(`${name} exited with ${code}`)
    stop(1)
  })
  children.push(child)
}

function stop(code) {
  for (const child of children) {
    child.removeAllListeners('exit')
    child.kill()
  }
  process.exit(code)
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

async function ready(name, url) {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
    const response = await fetch(url).catch(() => undefined)
    if (response?.ok) return console.log(`${name} ready: ${url}`)
    await new Promise((settle) => setTimeout(settle, READY_INTERVAL_MS))
  }
  console.error(`${name} did not become ready: ${url}`)
  stop(1)
}

mkdirSync(join(DATA_DIR, 'logs'), { recursive: true, mode: 0o700 })
mkdirSync(join(DATA_DIR, 'store'), { recursive: true, mode: 0o700 })
const secret = secrets()

start('identity', process.execPath, ['scripts/e2e/identity.mjs'], {
  ...process.env,
  E2E_IDENTITY_CLIENT_ID: IDENTITY_CLIENT_ID,
  E2E_IDENTITY_CLIENT_SECRET: secret.identityClientSecret,
  E2E_IDENTITY_COOKIE_KEY: secret.identityCookieKey,
  E2E_ISSUER_CALLBACK: `${API}/oauth/callback`,
})
await ready('identity', `${IDENTITY}/.well-known/openid-configuration`)

start('server', server, [], {
  ...process.env,
  ...providerKeys(),
  RUSTY_RED_PORT: String(API_PORT),
  RUSTY_RED_DATA_DIR: join(DATA_DIR, 'store'),
  RUSTY_RED_ALLOWED_ORIGINS: UI,
  RUSTY_RED_RECOVERY_TIMEOUT_SECS: '1800',
  RUSTY_RED_REQUIRE_AUTH: 'true',
  RUSTY_RED_MCP_DEFAULT_TENANT: ACCOUNT,
  RUSTY_RED_PREWARM_TENANTS: ACCOUNT,
  RUSTY_RED_TENANT_ADMISSION: 'allowlist',
  RUSTY_RED_TENANT_ALLOWLIST: ACCOUNT,
  RUSTY_RED_SESSION_SIGNING_KEY_HEX: secret.sessionSigningKey,
  THEOREM_PUBLICATION_SIGNING_KEY_HEX: secret.publicationSigningKey,
  THEOREMWEB_CHAT_MODEL: 'openrouter/thinkingmachines/inkling',
  RUSTY_RED_OAUTH_ENABLED: 'true',
  RUSTY_RED_OAUTH_PUBLIC_URL: API,
  RUSTY_RED_OAUTH_IDENTITY_PROVIDER: 'oidc',
  RUSTY_RED_OIDC_ISSUER: IDENTITY,
  RUSTY_RED_OIDC_AUTHORIZATION_ENDPOINT: `${IDENTITY}/auth`,
  RUSTY_RED_OIDC_TOKEN_ENDPOINT: `${IDENTITY}/token`,
  RUSTY_RED_OIDC_USERINFO_ENDPOINT: `${IDENTITY}/me`,
  RUSTY_RED_OIDC_CLIENT_ID: IDENTITY_CLIENT_ID,
  RUSTY_RED_OIDC_CLIENT_SECRET: secret.identityClientSecret,
  RUSTY_RED_OAUTH_CLIENTS_JSON: JSON.stringify([
    {
      client_id: CLIENT_ID,
      client_name: 'Theorem end to end',
      redirect_uris: [`${UI}/auth/callback`],
      extra_scopes: ['models:invoke', 'agency:approve'],
    },
  ]),
})
await ready('server', `${API}/.well-known/oauth-authorization-server`)

const { THEOREM_API_TOKEN: _deploymentToken, ...uiEnv } = process.env
start('ui', process.execPath, [
  'node_modules/.bin/vite',
  'dev',
  '--port',
  String(UI_PORT),
  '--strictPort',
], {
  ...uiEnv,
  THEOREM_API_URL: API,
  THEOREM_OAUTH_CLIENT_ID: CLIENT_ID,
  THEOREM_SESSION_SECRET: secret.uiSessionSecret,
})
await ready('ui', `${UI}/login`)

console.log(`Stack is up. Sign in at ${UI} as ${ACCOUNT}. Logs: ${DATA_DIR}/logs`)
