// SOURCING: modelled on the app's scripts/e2e/stack.mjs; Node's child_process and parseEnv, nothing to adopt.
//
// The public demo account, on this machine: a Theorem server that admits one
// static token for one tenant, and the real app in front of it in token mode,
// so nobody signs in and every visitor shares that account. The app shows the
// tenant's name in its sidebar, so the name says what the account is. The page
// frames this app (VITE_DEMO_URL). Models are real calls through Theorem's
// catalog, using the keys in ~/.theorem/provider-keys.env.
//
//   DEMO_SERVER_BIN=<path to rustyred-thg-server> node site/demo/local-stack.mjs
//
// The app is a commit of this repository (DEMO_APP_REF, by default origin/main
// as last fetched), exported beside the store, so the window shows released
// Theorem whatever branch this checkout is on. Generated secrets, the store
// and that export stay in DEMO_DATA_DIR, outside the repo.
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseEnv } from 'node:util'

const TENANT = 'shared'
const UI_PORT = Number(process.env.DEMO_UI_PORT ?? 3120)
const API_PORT = Number(process.env.DEMO_API_PORT ?? 8412)
const UI = `http://localhost:${UI_PORT}`
const API = `http://127.0.0.1:${API_PORT}`
const DATA_DIR =
  process.env.DEMO_DATA_DIR ?? join(homedir(), '.theorem', 'demo-local')
const repo = resolve(import.meta.dirname, '../..')
const REF = process.env.DEMO_APP_REF ?? 'origin/main'
const server = process.env.DEMO_SERVER_BIN

if (!server || !existsSync(server)) {
  console.error('Set DEMO_SERVER_BIN to a built rustyred-thg-server.')
  process.exit(1)
}

mkdirSync(join(DATA_DIR, 'logs'), { recursive: true, mode: 0o700 })
mkdirSync(join(DATA_DIR, 'store'), { recursive: true, mode: 0o700 })

function secrets() {
  const path = join(DATA_DIR, 'secrets.json')
  const hex = (bytes) => randomBytes(bytes).toString('hex')
  const all = {
    sessionSigningKey: hex(32),
    publicationSigningKey: hex(32),
    demoToken: `demo-${hex(24)}`,
    ...(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}),
  }
  writeFileSync(path, JSON.stringify(all), { mode: 0o600 })
  return all
}

function providerKeys() {
  const path = join(homedir(), '.theorem', 'provider-keys.env')
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {}
}

// Exports REF and installs it, once per commit: a later start on the same
// commit reuses the export, and a new commit replaces it.
function exportApp() {
  const run = (cwd, command, args, env = process.env) =>
    execFileSync(command, args, {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    })
  const commit = run(repo, 'git', ['rev-parse', `${REF}^{commit}`]).trim()
  const dir = join(DATA_DIR, 'app')
  const stamp = join(dir, '.demo-commit')
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === commit) return dir

  console.log(`Exporting ${REF} (${commit.slice(0, 7)}) to ${dir}`)
  const tar = join(DATA_DIR, 'app.tar')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  run(repo, 'git', ['archive', '-o', tar, commit])
  run(dir, 'tar', ['-xf', tar])
  rmSync(tar)
  run(dir, 'bun', ['install', '--frozen-lockfile'])
  // The terminal's WebAssembly is built, not committed. Its build directory is
  // kept across exports so only the first one compiles from nothing.
  run(dir, 'sh', ['terminal/build.sh'], {
    ...process.env,
    CARGO_TARGET_DIR: join(DATA_DIR, 'terminal-target'),
  })
  writeFileSync(stamp, commit)
  return dir
}

const app = exportApp()

const children = []
function start(name, command, args, env) {
  const log = createWriteStream(join(DATA_DIR, 'logs', `${name}.log`), {
    flags: 'a',
  })
  const child = spawn(command, args, {
    cwd: app,
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

async function ready(name, url, headers) {
  for (let attempt = 0; attempt < 600; attempt++) {
    const response = await fetch(url, { headers }).catch(() => undefined)
    if (response?.ok) return console.log(`${name} ready: ${url}`)
    await new Promise((settle) => setTimeout(settle, 1_000))
  }
  console.error(`${name} did not become ready: ${url}`)
  stop(1)
}

const secret = secrets()
const keys = providerKeys()

// The server does not start without a web search provider. Name one in
// provider-keys.env (RUSTYWEB_SEARCH_PROVIDERS=firecrawl with FIRECRAWL_API_KEY,
// say) and the window's searches are real; with none named, the offline
// provider runs on an empty manifest and searches return nothing.
const manifest = join(DATA_DIR, 'search-seed.jsonl')
if (!existsSync(manifest)) writeFileSync(manifest, '')

start('server', server, [], {
  ...process.env,
  RUSTYWEB_SEARCH_PROVIDERS: 'offline',
  RUSTYWEB_OFFLINE_SEARCH_MANIFEST: manifest,
  ...keys,
  RUSTY_RED_PORT: String(API_PORT),
  RUSTY_RED_DATA_DIR: join(DATA_DIR, 'store'),
  RUSTY_RED_ALLOWED_ORIGINS: UI,
  RUSTY_RED_RECOVERY_TIMEOUT_SECS: '1800',
  RUSTY_RED_REQUIRE_AUTH: 'true',
  RUSTY_RED_MCP_DEFAULT_TENANT: TENANT,
  RUSTY_RED_PREWARM_TENANTS: TENANT,
  RUSTY_RED_TENANT_ADMISSION: 'allowlist',
  RUSTY_RED_TENANT_ALLOWLIST: TENANT,
  RUSTY_RED_SESSION_SIGNING_KEY_HEX: secret.sessionSigningKey,
  THEOREM_PUBLICATION_SIGNING_KEY_HEX: secret.publicationSigningKey,
  // The demo account: one static token, bound to the tenant, with what chat needs.
  RUSTY_RED_API_TOKENS: `${secret.demoToken}@${TENANT}=tenant:read|tenant:write|models:invoke`,
})
const bearer = { authorization: `Bearer ${secret.demoToken}` }
await ready('server', `${API}/api/chat/v1/bootstrap`, bearer)

// Token mode: with no OAuth client id the app calls Theorem with this token and shows no sign-in.
const {
  THEOREM_OAUTH_CLIENT_ID: _client,
  THEOREM_OAUTH_CLIENT_SECRET: _clientSecret,
  THEOREM_OAUTH_ISSUER: _issuer,
  ...uiEnv
} = process.env
start(
  'ui',
  process.execPath,
  ['node_modules/.bin/vite', 'dev', '--port', String(UI_PORT), '--strictPort'],
  {
    ...uiEnv,
    THEOREM_API_URL: API,
    THEOREM_API_TOKEN: secret.demoToken,
    THEOREM_OAUTH_CLIENT_ID: '',
  },
)
await ready('ui', `${UI}/api/chat/v1/bootstrap`)

console.log(
  `Demo account is up at ${UI} (tenant ${TENANT}). Logs: ${DATA_DIR}/logs`,
)
