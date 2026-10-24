// A stand-in for the desktop host (plan D4, D5; docs/desktop/local-server.md):
// starts the built server in desktop mode and speaks its control channel, so
// the app can run in any browser without the native shell.
//
//   bun run build
//   bun scripts/desktop-stub-host.ts --grant ~/Notes --pick ~/Projects
//
// Then open the printed session URL. The secret in it works once.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import type { FolderGrant } from '#/lib/desktop/bindings/FolderGrant'
import type { HostCall } from '#/lib/desktop/bindings/HostCall'
import type { ToServer } from '#/lib/desktop/bindings/ToServer'
import type { JsonValue } from '#/lib/desktop/bindings/serde_json/JsonValue'
import { encodeLine, parseLine, toHostSchema } from '#/server/desktop/protocol'

const { values: options } = parseArgs({
  options: {
    // Folders granted at launch, sent in `hello`.
    grant: { type: 'string', multiple: true, default: [] },
    // Folders the "picker" returns, one per pickFolder call; then it cancels.
    pick: { type: 'string', multiple: true, default: [] },
    port: { type: 'string', default: '4317' },
    'block-port': { type: 'string', default: '4318' },
    'data-dir': { type: 'string' },
    server: { type: 'string', default: '.output/server/index.mjs' },
  },
})

const toGrant = (folder: string): FolderGrant => {
  const resolved = realpathSync(folder)
  return { path: resolved, name: path.basename(resolved) }
}

let grants = options.grant.map(toGrant)
const picks = options.pick.map(toGrant)
const secret = randomBytes(32).toString('base64url')
const dataDir =
  options['data-dir'] ?? mkdtempSync(path.join(tmpdir(), 'theorem-desktop-'))

const server = spawn(process.execPath, ['run', options.server], {
  env: {
    ...process.env,
    THEOREM_DESKTOP: '1',
    THEOREM_DESKTOP_DATA_DIR: dataDir,
    NITRO_HOST: '127.0.0.1',
    NITRO_PORT: options.port,
    THEOREM_BLOCK_PORT: options['block-port'],
  },
  stdio: ['pipe', 'pipe', 'inherit'],
})

const send = (message: ToServer) => server.stdin.write(encodeLine(message))

// The first line, written before the server is even listening.
send({ ctl: 'hello', secret, grants })

createInterface({ input: server.stdout }).on('line', (line) => {
  const message = parseLine(toHostSchema, line)
  if (!message) {
    console.log(`[server] ${line}`)
    return
  }
  if (message.ctl === 'ready') {
    console.log(
      `[stub] ready. Open http://127.0.0.1:${message.port}/desktop/session?secret=${secret}`,
    )
    return
  }
  const result = answer(message.call)
  console.log(
    `[stub] rpc ${message.id} ${JSON.stringify(message.call)} -> ${JSON.stringify(result)}`,
  )
  send({ ctl: 'rpc-result', id: message.id, result, error: null })
})

/** pickFolder takes the next --pick folder and grants it; the rest answer null. */
function answer(call: HostCall): JsonValue | null {
  if (call.method !== 'pickFolder') return null
  const picked = picks.shift()
  if (!picked) return null
  if (!grants.some((grant) => grant.path === picked.path)) {
    grants = [...grants, picked]
    send({ ctl: 'grants', grants })
  }
  return picked
}

server.on('exit', (code, signal) => {
  console.log(`[stub] server exited (${signal ?? code})`)
  process.exit(code ?? 1)
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.kill(signal))
}
