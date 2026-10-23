// SOURCING: esbuild-wasm (bundles the compiled tool, the sandbox runtime and
// the vendored modules it imports into one module, in the page), picomatch
// (the files the tool declared), the bridge's own decoder (CSV rows as a frame
// gets them), Web Crypto (the inline script's hash for the page's policy).
// The export is plan D9's standalone HTML: the tool, its declared files and
// state, and nothing else, under the same policy a block frame has.
import type * as Esbuild from 'esbuild-wasm'
import picomatch from 'picomatch'
import type { WorkspaceClient } from '@/lib/workspace/types'
import { checkPath, decodeFile } from './bridge'
import type { StateCollections } from './bridge'
import { compileCell } from './compile'
import type { CompiledCell } from './compile'
import {
  BLOCK_DOCUMENT_STYLE,
  connectSources,
  contentSecurityPolicy,
} from './document'
import { runtimeSources } from './runtime-sources'
import type { ExportedData } from './sandbox/standalone'
import { encodeRows } from './sandbox/standalone'
import { toBase64 } from './state'
import { importMap } from './vendor/manifest'
import { vendorModules } from './vendor/modules'

type Bundler = Pick<typeof Esbuild, 'build'>

export interface ExportOptions {
  /** The workspace's state, whose declared collections the export carries. */
  state: StateCollections
  /** esbuild; the page's wasm build unless given (tests pass Bun's). */
  esbuild?: () => Promise<Bundler>
  compile?: (source: string) => Promise<CompiledCell>
}

export interface ExportedTool {
  /** Where the page was written, `Exports/<name>.html`. */
  path: string
  bytes: number
}

/** The most file data one export carries. */
export const MAX_EXPORT_BYTES = 10 * 1024 * 1024

let browserBuild: Promise<Bundler> | null = null

/** esbuild-wasm in the page, its wasm served with the app's own assets. */
export function browserEsbuild(): Promise<Bundler> {
  browserBuild ??= (async () => {
    const [esbuild, wasm] = await Promise.all([
      import('esbuild-wasm'),
      import('esbuild-wasm/esbuild.wasm?url'),
    ])
    await esbuild.initialize({ wasmURL: wasm.default })
    return esbuild
  })()
  return browserBuild
}

const NAMESPACE = {
  entry: 'theorem',
  runtime: 'theorem-runtime',
  vendor: 'theorem-vendor',
}

/**
 * Resolves the entry and the compiled cell from memory, `./name` to the
 * sandbox runtime's sources and bare names through the import map to the
 * vendored files: the same modules a block frame loads, and no others.
 */
function exportPlugin(entry: string, cell: string): Esbuild.Plugin {
  return {
    name: 'theorem-export',
    setup(build) {
      build.onResolve({ filter: /^theorem:(entry|cell)$/ }, ({ path }) => ({
        path: path.slice('theorem:'.length),
        namespace: NAMESPACE.entry,
      }))
      build.onResolve({ filter: /^\.\/[\w-]+$/ }, ({ path, namespace }) =>
        namespace === NAMESPACE.vendor
          ? undefined
          : { path: path.slice(2), namespace: NAMESPACE.runtime },
      )
      build.onResolve({ filter: /.*/ }, ({ path }) => {
        const imports: Record<string, string> = importMap.imports
        const served = Object.hasOwn(imports, path) ? imports[path]! : path
        if (Object.hasOwn(vendorModules, served))
          return { path: served, namespace: NAMESPACE.vendor }
        return {
          errors: [{ text: `"${path}" is not in the blocks' import map` }],
        }
      })
      build.onLoad(
        { filter: /.*/, namespace: NAMESPACE.entry },
        ({ path }) => ({
          contents: path === 'entry' ? entry : cell,
          loader: 'js',
        }),
      )
      build.onLoad(
        { filter: /.*/, namespace: NAMESPACE.runtime },
        ({ path }) =>
          Object.hasOwn(runtimeSources, path)
            ? { contents: runtimeSources[path], loader: 'ts' }
            : {
                errors: [
                  { text: `The sandbox runtime has no module "${path}"` },
                ],
              },
      )
      build.onLoad(
        { filter: /.*/, namespace: NAMESPACE.vendor },
        ({ path }) => ({
          contents: vendorModules[path],
          loader: 'js',
        }),
      )
    },
  }
}

/**
 * esbuild already writes `</script` as `<\/script`. `<!--` would put the
 * HTML parser in its escaped script state, where a later `<script` keeps the
 * closing tag from ending the element; `\x21` is `!` in a string, template
 * or regular expression alike.
 */
const inlineSafe = (code: string) => code.replaceAll('<!--', '<\\x21--')

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )
  return toBase64(new Uint8Array(digest))
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!,
  )

/** The data an export carries: the declared files and state, as they are. */
async function exportedData(
  client: WorkspaceClient,
  name: string,
  cell: CompiledCell,
  state: StateCollections,
): Promise<ExportedData> {
  const { read, state: collections } = cell.capabilities
  const mayRead = read.length ? picomatch(read, { dot: false }) : () => false
  // What the bridge would serve: inside the folder, nothing hidden, declared.
  const readable = (path: string) => {
    try {
      return mayRead(checkPath(path))
    } catch {
      return false
    }
  }
  const declared = (await client.tree()).filter(
    (entry) => entry.kind === 'file' && readable(entry.path),
  )
  const total = declared.reduce((sum, entry) => sum + entry.size, 0)
  if (total > MAX_EXPORT_BYTES)
    throw new Error(
      `The files ${name} reads come to ${Math.round(total / 1024 / 1024)} MB; an export carries at most ${MAX_EXPORT_BYTES / 1024 / 1024} MB`,
    )
  const files: ExportedData['files'] = {}
  for (const entry of declared) {
    const { bytes } = await client.read(entry.path)
    files[entry.path] = {
      base64: toBase64(bytes),
      csv: /\.csv$/i.test(entry.path)
        ? encodeRows(decodeFile(bytes, 'csv'))
        : null,
    }
  }
  const lists: ExportedData['lists'] = {}
  for (const glob of read) {
    const matches = picomatch(glob, { dot: false })
    lists[glob] = declared
      .filter((entry) => matches(entry.path))
      .map(({ path, size, mtimeMs }) => ({ path, size, mtimeMs }))
  }
  return {
    name,
    files,
    lists,
    state: Object.fromEntries(
      collections.map((collection) => [collection, state.snapshot(collection)]),
    ),
  }
}

/** The tool, its runtime and its data as one module. */
async function bundle(
  cell: CompiledCell,
  data: ExportedData,
  esbuild: Bundler,
): Promise<string> {
  const entry = [
    `import * as cell from 'theorem:cell'`,
    `import { startStandalone } from './standalone'`,
    `void startStandalone(cell, ${JSON.stringify(data)})`,
  ].join('\n')
  const result = await esbuild.build({
    entryPoints: ['theorem:entry'],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    logLevel: 'silent',
    plugins: [exportPlugin(entry, cell.code)],
  })
  const output = result.outputFiles[0]
  if (!output) throw new Error('esbuild wrote nothing')
  return inlineSafe(output.text)
}

/** The page: one inline module, allowed by its hash and nothing else. */
async function exportDocument(
  name: string,
  script: string,
  net: Array<string>,
): Promise<string> {
  const policy = contentSecurityPolicy({
    'default-src': "'none'",
    'script-src': `'sha256-${await sha256Base64(script)}'`,
    'style-src': "'unsafe-inline'",
    'img-src': 'data: blob:',
    'font-src': 'data:',
    'media-src': 'data: blob:',
    'connect-src': connectSources(net),
    'form-action': "'none'",
    'base-uri': "'none'",
  })
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}">
<title>${escapeHtml(name)}</title>
<style>${BLOCK_DOCUMENT_STYLE}</style>
</head><body><div id="root"></div>
<script type="module">${script}</script>
</body></html>
`
}

/**
 * Exports a tool file as one HTML page that runs anywhere: the compiled tool,
 * the sandbox runtime, React and the files and state it declared, inline.
 * Writes `Exports/<name>.html` beside the folder's other files.
 */
export async function exportTool(
  client: WorkspaceClient,
  path: string,
  options: ExportOptions,
): Promise<ExportedTool> {
  const name = (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '')
  const { text } = await client.readText(path)
  const cell = await (options.compile ?? compileCell)(text)
  if (cell.declarationErrors.length)
    throw new Error(
      `${path} has declaration problems: ${cell.declarationErrors.join('; ')}`,
    )
  const data = await exportedData(client, name, cell, options.state)
  const script = await bundle(
    cell,
    data,
    await (options.esbuild ?? browserEsbuild)(),
  )
  const html = await exportDocument(name, script, cell.capabilities.net)
  const out = `Exports/${name}.html`
  await client.write(out, html)
  return { path: out, bytes: new TextEncoder().encode(html).length }
}
