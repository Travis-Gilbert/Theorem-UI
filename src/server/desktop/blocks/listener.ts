// SOURCING: Bun.serve (the second loopback listener, plan D9), Bun's
// HTMLRewriter (an HTML app's `theorem:uses` declarations are read, and the
// bridge script added, while the page streams), Bun.file().type (content
// types). The routes and checks are this app's own.
import { parseHtmlDeclarations } from '#/lib/blocks/declarations'
import { BLOCK_DOCUMENT_STYLE } from '#/lib/blocks/document'
import type { WorkspaceId } from '#/lib/workspace/types'
import { importMapScript, runtimeModules, vendorModule } from './assets'
import { appPolicy, cellPolicy } from './csp'
import type { BlockStore } from './store'
import { readAppToken } from './tokens'

/** What the listener needs to know about a workspace. */
export interface BlockWorkspace {
  trusted: boolean
  store: BlockStore
  read: (path: string) => Promise<{ bytes: Uint8Array }>
}

export interface BlockListenerConfig {
  /** The listener's own `127.0.0.1:<port>`: every request must name it. */
  host: string
  /** The app's origin, the only page allowed to frame a block. */
  appOrigin: string
  /** The open workspace with this id, or null. */
  workspace: (id: WorkspaceId) => Promise<BlockWorkspace | null>
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'cross-origin',
  'cache-control': 'no-store',
}

/** Module scripts load with CORS; a sandboxed document's origin is `null`. */
const SCRIPT_HEADERS = {
  ...SECURITY_HEADERS,
  'content-type': 'text/javascript; charset=utf-8',
  'access-control-allow-origin': 'null',
}

const IMMUTABLE = 'public, max-age=31536000, immutable'

const text = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { ...SECURITY_HEADERS, 'content-type': 'text/plain' },
  })

const KEY = /^[0-9a-f]{64}$/
const ID = /^ws_[0-9A-Za-z]+$/

/** A path inside an app's folder: no hidden segments, nothing above it. */
function appFile(segments: Array<string>): string | null {
  if (
    segments.some(
      (segment) =>
        !segment || segment.startsWith('.') || segment.includes('\\'),
    )
  )
    return null
  return segments.join('/')
}

function decodeSegments(segments: Array<string>): Array<string> | null {
  try {
    return segments.map(decodeURIComponent)
  } catch {
    return null
  }
}

function cellDocument(cellPath: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="theorem:cell" content="${cellPath}">
<script type="importmap">${importMapScript}</script>
<style>${BLOCK_DOCUMENT_STYLE}</style>
<script type="module" src="/__runtime/cell-runtime"></script>
</head><body><div id="root"></div></body></html>`
}

/**
 * The block listener's request handler: a plain function, so the loopback
 * listener mounts it today and a per-workspace subdomain route can later.
 */
export function createBlockHandler(config: BlockListenerConfig) {
  const origin = `http://${config.host}`

  async function trustedWorkspace(id: string) {
    if (!ID.test(id)) return null
    const workspace = await config.workspace(id)
    return workspace?.trusted ? workspace : null
  }

  async function cell(id: string, key: string, module: boolean) {
    const cleanKey = key.replace(/\.js$/, '')
    if (!KEY.test(cleanKey) || module !== key.endsWith('.js'))
      return text(404, 'Not found')
    const workspace = await trustedWorkspace(id)
    if (!workspace) return text(403, 'This folder is not trusted')
    const compiled = await workspace.store.readCompiled(cleanKey)
    if (!compiled) return text(404, 'This block has not been compiled')
    const cellPath = `/compiled/${id}/${cleanKey}.js`
    if (module)
      return new Response(compiled.code, {
        headers: { ...SCRIPT_HEADERS, 'cache-control': IMMUTABLE },
      })
    return new Response(cellDocument(cellPath), {
      headers: {
        ...SECURITY_HEADERS,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': cellPolicy({
          origin,
          appOrigin: config.appOrigin,
          net: compiled.capabilities.net,
          cellPath,
          importMap: importMapScript,
        }),
      },
    })
  }

  async function app(token: string, segments: Array<string>) {
    const claims = readAppToken(token)
    if (!claims) return text(403, 'This app link has expired')
    const relative = appFile(segments.length ? segments : ['index.html'])
    if (relative === null) return text(404, 'Not found')
    const workspace = await trustedWorkspace(claims.w)
    if (!workspace) return text(403, 'This folder is not trusted')
    const filePath = claims.r ? `${claims.r}/${relative}` : relative
    let bytes: Uint8Array
    try {
      ;({ bytes } = await workspace.read(filePath))
    } catch {
      return text(404, 'Not found')
    }
    const type = Bun.file(filePath).type
    if (!type.startsWith('text/html'))
      return new Response(bytes as Uint8Array<ArrayBuffer>, {
        headers: {
          ...SECURITY_HEADERS,
          'content-type': type,
          'access-control-allow-origin': 'null',
        },
      })
    // Read the declarations first: they decide the policy header.
    const uses: Array<string> = []
    const html = new TextDecoder().decode(bytes)
    new HTMLRewriter()
      .on('meta[name="theorem:uses"]', {
        element: (element) => {
          uses.push(element.getAttribute('content') ?? '')
        },
      })
      .transform(html)
    const { capabilities } = parseHtmlDeclarations(uses)
    const page = new HTMLRewriter()
      .on('head', {
        element: (element) => {
          element.prepend(
            `<script type="importmap">${importMapScript}</script><script type="module" src="/__runtime/app-bridge"></script>`,
            { html: true },
          )
        },
      })
      .transform(html)
    return new Response(page, {
      headers: {
        ...SECURITY_HEADERS,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': appPolicy({
          origin,
          appOrigin: config.appOrigin,
          net: capabilities.net,
          appPath: `/app/${token}/`,
        }),
      },
    })
  }

  return async function handle(request: Request): Promise<Response> {
    // Only this listener's own name: a DNS-rebound name never reaches a block.
    if (request.headers.get('host') !== config.host)
      return text(403, 'Forbidden')
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return text(405, 'Method not allowed')
    const url = new URL(request.url)
    const [kind, ...rest] = url.pathname.slice(1).split('/')
    try {
      switch (kind) {
        case '__runtime': {
          const module = rest.length === 1 && runtimeModules().get(rest[0]!)
          return module
            ? new Response(module, { headers: SCRIPT_HEADERS })
            : text(404, 'Not found')
        }
        case 'vendor': {
          const module = vendorModule(url.pathname)
          return module
            ? new Response(module, {
                headers: { ...SCRIPT_HEADERS, 'cache-control': IMMUTABLE },
              })
            : text(404, 'Not found')
        }
        case 'cell':
        case 'compiled':
          return rest.length === 2
            ? await cell(rest[0]!, rest[1]!, kind === 'compiled')
            : text(404, 'Not found')
        case 'app': {
          const segments = decodeSegments(rest.slice(1))
          return rest[0] && segments
            ? await app(rest[0], segments)
            : text(404, 'Not found')
        }
        default:
          return text(404, 'Not found')
      }
    } catch (error) {
      console.error('[blocks] request failed', error)
      return text(500, 'The block listener failed')
    }
  }
}

/** Starts the block listener on `127.0.0.1:<port>` (0 picks a free port). */
export function startBlockListener(
  port: number,
  config: Omit<BlockListenerConfig, 'host'>,
) {
  let host = `127.0.0.1:${port}`
  let handle = createBlockHandler({ ...config, host })
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    fetch: (request) => handle(request),
  })
  if (port === 0) {
    host = `127.0.0.1:${server.port}`
    handle = createBlockHandler({ ...config, host })
  }
  return { server, host, origin: `http://${host}` }
}
