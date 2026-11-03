// FIXTURE (evidence grade: fixture). The page has no Tauri runtime and never looks for one: no
// Tauri package is installed or locked, every `@tauri-apps/*` import the frontend makes resolves
// to the browser host through both the Vite and the TypeScript aliases, no shipped source reads or
// writes a `__TAURI*` global, and at run time `invoke` reaches only the installed host. The scan
// tokenizes with the TypeScript scanner, so comments are not counted and identifiers are.

import { beforeAll, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import viteConfig from '../vite.config'

const root = join(import.meta.dir, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function files(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name)
    if (statSync(join(root, path)).isDirectory()) out.push(...files(path, keep))
    else if (keep(path)) out.push(path)
  }
  return out
}

// What the page is built from: our entry and host, the vendored frontend except `main.tsx` (the
// desktop entry, replaced by src/entry.tsx; checked below to be unreachable), and the public
// scripts copied into the build.
const isSource = (p: string) => /\.(ts|tsx|js|mjs)$/.test(p)
const shipped = [
  ...files('src', isSource),
  ...files('vendor/openidea/src', isSource).filter((p) => p !== 'vendor/openidea/src/main.tsx'),
  ...files('vendor/openidea/public', isSource),
]

/** Every identifier and string literal in a file, comments skipped. */
function tokens(path: string): { kind: 'identifier' | 'string'; text: string }[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, read(path))
  const out: { kind: 'identifier' | 'string'; text: string }[] = []
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.Identifier) out.push({ kind: 'identifier', text: scanner.getTokenValue() })
    else if (kind === ts.SyntaxKind.StringLiteral || kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
      out.push({ kind: 'string', text: scanner.getTokenValue() })
    }
  }
  return out
}

// Each test below that scans the whole shipped tree parses a few hundred files with the
// TypeScript parser. That takes about a second on an idle machine and more than ten seconds under a
// full build queue, so these tests get their own budget instead of bun's 5 s default, and each
// file's imports are parsed once.
const SCAN_TIMEOUT_MS = 60_000
const parsed = new Map<string, string[]>()

/** The module specifiers a file imports, statically or with `import()`. */
function imports(path: string): string[] {
  const known = parsed.get(path)
  if (known) return known
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true)
  const out: string[] = []
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push(node.moduleSpecifier.text)
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      out.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  parsed.set(path, out)
  return out
}

describe('no Tauri package', () => {
  test('nothing from @tauri-apps is a dependency, locked, or installed', () => {
    const manifest = JSON.parse(read('package.json')) as Record<string, Record<string, string> | undefined>
    const declared = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].flatMap((k) => Object.keys(manifest[k] ?? {}))
    expect(declared.filter((name) => name.startsWith('@tauri-apps/'))).toEqual([])
    expect(read('bun.lock')).not.toContain('@tauri-apps/')
    expect(existsSync(join(root, 'node_modules/@tauri-apps'))).toBe(false)
  })

  test('every @tauri-apps import resolves to the browser host through both alias tables', () => {
    const specifiers = new Set(shipped.flatMap(imports).filter((s) => s.startsWith('@tauri-apps/')))
    // A positive control: the frontend does import these, so an empty scan would be a broken scan.
    for (const known of ['@tauri-apps/api/core', '@tauri-apps/api/event', '@tauri-apps/api/window', '@tauri-apps/plugin-dialog', '@tauri-apps/plugin-opener']) {
      expect(specifiers.has(known)).toBe(true)
    }
    const aliases = (viteConfig as { resolve: { alias: { find: RegExp; replacement: string }[] } }).resolve.alias
    const paths = (JSON.parse(read('tsconfig.json')) as { compilerOptions: { paths: Record<string, string[]> } }).compilerOptions.paths
    const allowed = [join(root, 'src/host') + '/', join(root, 'vendor/openidea/src/platform/tauriCore.ts')]
    for (const specifier of specifiers) {
      const alias = aliases.find((a) => a.find.test(specifier))
      expect(alias, `${specifier} has no Vite alias`).toBeDefined()
      expect(allowed.some((a) => alias!.replacement.startsWith(a)), `${specifier} is aliased outside the host`).toBe(true)
      const target = paths[specifier]?.[0]
      expect(target, `${specifier} has no tsconfig path`).toBeDefined()
      expect(allowed.some((a) => join(root, target!).startsWith(a)), `${specifier} maps outside the host`).toBe(true)
    }
    // The one vendored module an alias points at sits on the host and nothing else.
    expect(imports('vendor/openidea/src/platform/tauriCore.ts')).toEqual(['@host/tauri-core', '@host/tauri-core'])
  }, SCAN_TIMEOUT_MS)
})

describe('no Tauri global', () => {
  test('no shipped source reads or writes a __TAURI* global', () => {
    const found: string[] = []
    for (const path of shipped) {
      for (const token of tokens(path)) if (/__TAURI/.test(token.text)) found.push(`${path}: ${token.kind} ${token.text}`)
    }
    // `bindings.ts` (generated by tauri-specta) names its import of `invoke` `__TAURI_INVOKE`: a
    // local binding, not a global. Prove that is all it is, then set it aside.
    const bindings = ts.createSourceFile('bindings.ts', read('vendor/openidea/src/bindings.ts'), ts.ScriptTarget.Latest, true)
    const alias = bindings.statements
      .filter(ts.isImportDeclaration)
      .flatMap((d) => (d.importClause?.namedBindings && ts.isNamedImports(d.importClause.namedBindings) ? d.importClause.namedBindings.elements : []))
      .find((e) => e.name.text === '__TAURI_INVOKE')
    expect(alias?.propertyName?.text).toBe('invoke')
    const rest = found.filter((f) => f !== 'vendor/openidea/src/bindings.ts: identifier __TAURI_INVOKE')
    expect(found.length).toBeGreaterThan(rest.length)
    expect(rest).toEqual([])
  }, SCAN_TIMEOUT_MS)

  test('the scan sees a Tauri global when one is there (positive control on the desktop entry)', () => {
    expect(tokens('vendor/openidea/src/main.tsx').some((t) => t.text === '__TAURI__')).toBe(true)
  })

  test('the desktop entry is unreachable: the page loads src/entry.tsx and nothing imports main.tsx', () => {
    expect(read('index.html')).toContain('<script type="module" src="/src/entry.tsx"></script>')
    expect(read('index.html')).not.toMatch(/tauri/i)
    const importers = shipped.filter((path) => imports(path).some((s) => /(^|\/)main(\.tsx)?$/.test(s)))
    expect(importers).toEqual([])
  }, SCAN_TIMEOUT_MS)
})

describe('at run time', () => {
  // The frontend's IPC modules hold one host for the whole process, and other test files install
  // hosts in this one, so the no-host case runs in a process of its own (test/support/no-host-probe.ts).
  // It plants `__TAURI_INTERNALS__` with an `invoke` that records each call, before those modules
  // load, and keeps it planted after a host is installed.
  let probe: { withoutHost: Record<string, any>; withHost: Record<string, any> }
  beforeAll(() => {
    const run = Bun.spawnSync({ cmd: [process.execPath, 'test/support/no-host-probe.ts'], cwd: root, stdout: 'pipe', stderr: 'pipe' })
    if (run.exitCode !== 0) throw new Error(`the no-host probe failed: ${run.stderr.toString()}`)
    probe = JSON.parse(run.stdout.toString().trim().split('\n').at(-1)!)
  }, SCAN_TIMEOUT_MS)

  test('with no host installed, a planted Tauri global does not make a backend appear and invoke rejects without reading it', () => {
    const { withoutHost } = probe
    expect(withoutHost.hostAvailable).toBe(false)
    expect(withoutHost.ipcIsTauri).toBe(false)
    expect(withoutHost.coreIsTauri).toBe(false)
    expect(withoutHost.invoke).toEqual({ kind: 'rejected', message: expect.stringContaining('No Theorem workspace host is installed') })
    expect(withoutHost.planted).toEqual([])
  })

  test('once a host is installed (positive control, same process, global still planted), invoke reaches only that host', () => {
    const { withHost } = probe
    expect(withHost.globalStillPlanted).toBe(true)
    expect(withHost.hostAvailable).toBe(true)
    expect(withHost.ipcIsTauri).toBe(true)
    expect(withHost.coreIsTauri).toBe(true)
    expect(withHost.invoke).toEqual({ kind: 'resolved', value: { name: 'ide-cm' } })
    expect(withHost.served).toEqual(['app_info'])
    expect(withHost.refusedCommand).toMatchObject({ kind: 'rejected' })
    expect(withHost.refusedCount).toBe(1)
    expect(withHost.planted).toEqual([])
  })

  test('in this process, nothing defines a Tauri global, and an unprovided command is refused and counted', async () => {
    const core = await import('@tauri-apps/api/core')
    const ipc = await import('@/platform/ipc')
    const { installHost } = await import('../src/host/host')
    const { BrowserHostImpl } = await import('../src/host/browser-host')
    const tauriKeys = () => Object.getOwnPropertyNames(globalThis).filter((k) => /tauri/i.test(k))

    // Whatever an earlier test file installed is not this test's; the module holds one host.
    const calls: string[] = []
    const host = new BrowserHostImpl({
      description: 'no-tauri test host',
      commands: new Map([['app_info', () => (calls.push('app_info'), { name: 'ide-cm' })]]),
      pick: async () => null,
      save: async () => null,
    })
    installHost(host)
    expect(ipc.isTauri()).toBe(true)
    expect(await core.invoke('app_info')).toEqual({ name: 'ide-cm' })
    expect(calls).toEqual(['app_info'])
    await expect(core.invoke('plugin:window|minimize')).rejects.toMatchObject({ kind: 'unavailable' })
    expect(host.refused.get('plugin:window|minimize')?.count).toBe(1)
    expect(tauriKeys()).toEqual([])
    expect('__TAURI_INTERNALS__' in window).toBe(false)
  })
})
