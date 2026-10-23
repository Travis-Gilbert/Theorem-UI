// SOURCING: bun:test over the block listener (listener.ts) on a real
// loopback port, with a temporary data folder.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parse } from 'acorn'
import { simple } from 'acorn-walk'
import type { Node as AcornNode } from 'acorn'
import { compileCell } from '#/lib/blocks/compile'
import { importMap } from '#/lib/blocks/vendor/manifest'
import { runtimeModules } from './assets'
import { scriptHash } from './csp'
import { startBlockListener } from './listener'
import type { BlockWorkspace } from './listener'
import { BlockStore } from './store'
import { issueAppToken } from './tokens'

const APP_ORIGIN = 'http://127.0.0.1:4100'
let dataDir: string
let listener: ReturnType<typeof startBlockListener>
const files: Record<string, string> = {
  'Apps/Clock/index.html':
    '<!doctype html><html><head><meta name="theorem:uses" content=\'files.read("Data/*.csv"), net("api.example.com")\'><title>Clock</title></head><body><script>document.body.append("tick")</script></body></html>',
  'Apps/Clock/clock.js': 'export const now = () => Date.now()',
  'Apps/Clock/.env': 'SECRET=1',
  'Data/secret.txt': 'secret',
}
const workspaces: Record<string, BlockWorkspace> = {}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'theorem-blocks-'))
  const read = async (file: string) => {
    if (!(file in files)) throw new Error('missing')
    return { bytes: new TextEncoder().encode(files[file]) }
  }
  workspaces.ws_trusted = {
    trusted: true,
    store: new BlockStore(path.join(dataDir, 'trusted')),
    read,
  }
  workspaces.ws_untrusted = {
    trusted: false,
    store: new BlockStore(path.join(dataDir, 'untrusted')),
    read,
  }
  listener = startBlockListener(0, {
    appOrigin: APP_ORIGIN,
    workspace: async (id) => workspaces[id] ?? null,
  })
})

afterAll(async () => {
  await listener.server.stop(true)
  await rm(dataDir, { recursive: true, force: true })
})

const get = (route: string, init?: RequestInit) =>
  fetch(`${listener.origin}${route}`, init)

function directives(policy: string | null): Record<string, string> {
  return Object.fromEntries(
    (policy ?? '').split(';').map((part) => {
      const [name = '', ...value] = part.trim().split(' ')
      return [name, value.join(' ')]
    }),
  )
}

async function compiledIn(workspace: BlockWorkspace, source: string) {
  const cell = await compileCell(source)
  await workspace.store.writeCompiled(cell)
  return cell
}

describe('the block listener', () => {
  test('answers only to its own Host', async () => {
    const response = await get('/__runtime/cell-runtime', {
      headers: { host: `localhost:${listener.server.port}` },
    })
    expect(response.status).toBe(403)
  })

  test('serves reads only', async () => {
    expect(
      (await get('/__runtime/cell-runtime', { method: 'POST' })).status,
    ).toBe(405)
  })

  test('serves the sandbox runtime as JavaScript a sandboxed document may load', async () => {
    const response = await get('/__runtime/cell-runtime')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/javascript')
    expect(response.headers.get('access-control-allow-origin')).toBe('null')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  test('every runtime import resolves to a runtime module or the import map', () => {
    const modules = runtimeModules()
    for (const [name, code] of modules) {
      const program = parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
      })
      simple(program, {
        ImportDeclaration(node) {
          const specifier = String(node.source.value)
          if (specifier.startsWith('./'))
            expect(
              modules.has(specifier.slice(2)),
              `${name} → ${specifier}`,
            ).toBe(true)
          else
            expect(
              Object.keys(importMap.imports),
              `${name} → ${specifier}`,
            ).toContain(specifier)
        },
      } as Record<
        string,
        (node: AcornNode & { source: { value: unknown } }) => void
      >)
    }
  })

  test('serves vendored modules that match their import map integrity', async () => {
    for (const [served, integrity] of Object.entries(importMap.integrity)) {
      const response = await get(served)
      expect(response.status).toBe(200)
      const digest = createHash('sha384')
        .update(Buffer.from(await response.arrayBuffer()))
        .digest('base64')
      expect(`sha384-${digest}`).toBe(integrity)
    }
  })

  test('a cell document carries the block policy: no network, scripts from the listener only', async () => {
    const cell = await compiledIn(workspaces.ws_trusted!, 'const a = 1')
    const response = await get(`/cell/ws_trusted/${cell.key}`)
    expect(response.status).toBe(200)
    const html = await response.text()
    const policy = directives(response.headers.get('content-security-policy'))
    expect(policy['default-src']).toBe("'none'")
    expect(policy['connect-src']).toBe("'none'")
    expect(policy['frame-ancestors']).toBe(APP_ORIGIN)
    expect(policy['form-action']).toBe("'none'")
    const inlineMap =
      /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''
    expect(policy['script-src']).toBe(
      `${listener.origin}/__runtime/ ${listener.origin}/vendor/ ${listener.origin}/compiled/ws_trusted/${cell.key}.js ${scriptHash(inlineMap)}`,
    )
    expect(html).toContain(`content="/compiled/ws_trusted/${cell.key}.js"`)

    const module = await get(`/compiled/ws_trusted/${cell.key}.js`)
    expect(module.status).toBe(200)
    expect(await module.text()).toBe(cell.code)
    expect(module.headers.get('cache-control')).toContain('immutable')
  })

  test('a block that declared net() may reach that host and no other', async () => {
    const cell = await compiledIn(
      workspaces.ws_trusted!,
      '// uses: net("api.example.com")\nconst a = 1',
    )
    const response = await get(`/cell/ws_trusted/${cell.key}`)
    expect(
      directives(response.headers.get('content-security-policy'))[
        'connect-src'
      ],
    ).toBe('https://api.example.com')
  })

  test('an untrusted folder gets no block documents and no compiled code', async () => {
    const cell = await compiledIn(workspaces.ws_untrusted!, 'const b = 2')
    expect((await get(`/cell/ws_untrusted/${cell.key}`)).status).toBe(403)
    expect((await get(`/compiled/ws_untrusted/${cell.key}.js`)).status).toBe(
      403,
    )
    expect((await get(`/cell/ws_missing/${cell.key}`)).status).toBe(403)
  })

  test('an HTML app gets the bridge, its policy and its own folder only', async () => {
    const token = issueAppToken('ws_trusted', 'Apps/Clock')
    const response = await get(`/app/${token}/index.html`)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain(
      '<script type="module" src="/__runtime/app-bridge"></script>',
    )
    expect(html).toContain('<script type="importmap">')
    const policy = directives(response.headers.get('content-security-policy'))
    expect(policy['connect-src']).toBe('https://api.example.com')
    expect(policy['script-src']).toContain(`${listener.origin}/app/${token}/`)
    expect(policy['frame-ancestors']).toBe(APP_ORIGIN)

    expect((await get(`/app/${token}/clock.js`)).status).toBe(200)
    expect((await get(`/app/${token}/.env`)).status).toBe(404)
    expect(
      (await get(`/app/${token}/..%2F..%2FData%2Fsecret.txt`)).status,
    ).toBe(404)
    expect((await get(`/app/${token}/../../Data/secret.txt`)).status).toBe(404)
    expect((await get(`/app/${token}x/index.html`)).status).toBe(403)
    const expired = issueAppToken(
      'ws_trusted',
      'Apps/Clock',
      Date.now() - 13 * 3600_000,
    )
    expect((await get(`/app/${expired}/index.html`)).status).toBe(403)
    const untrusted = issueAppToken('ws_untrusted', 'Apps/Clock')
    expect((await get(`/app/${untrusted}/index.html`)).status).toBe(403)
  })
})
