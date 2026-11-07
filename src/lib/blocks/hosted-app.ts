// Hosted documents use the same sandbox and bridge as desktop HTML Apps.
import type * as Esbuild from 'esbuild-wasm'
import { parseHtmlDeclarations } from './declarations'
import { connectSources, contentSecurityPolicy } from './document'
import { bundleAppBridge } from './export'

let bridgeScript: Promise<string> | undefined

/**
 * `net` replaces the document's own `theorem:uses` declarations: a page
 * module reaches the hosts the person allowed it, whatever its page says.
 */
export async function hostedAppDocument(
  html: string,
  esbuild?: Pick<typeof Esbuild, 'build'>,
  options: { net?: Array<string> } = {},
): Promise<string> {
  const page = new DOMParser().parseFromString(html, 'text/html')
  const net = options.net ?? declaredNet(page)
  const policy = page.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = contentSecurityPolicy({
    'default-src': "'none'",
    'script-src': "'unsafe-inline'",
    'style-src': "'unsafe-inline'",
    'img-src': 'data: blob:',
    'font-src': 'data:',
    'media-src': 'data: blob:',
    'connect-src': connectSources(net),
    'form-action': "'none'",
    'base-uri': "'none'",
  })
  const bridge = page.createElement('script')
  bridge.dataset.theoremAppBridge = ''
  bridge.textContent = esbuild
    ? await bundleAppBridge(esbuild)
    : await (bridgeScript ??= bundleAppBridge().catch((error) => {
        bridgeScript = undefined
        throw error
      }))
  // Install the host policy before any author content. The classic IIFE
  // exposes theorem.ready before the App's own scripts can execute.
  page.head.prepend(policy, bridge)
  return `<!doctype html>\n${page.documentElement.outerHTML}`
}

function declaredNet(page: Document): Array<string> {
  const declarations = parseHtmlDeclarations(
    [...page.querySelectorAll('meta[name="theorem:uses"]')].map(
      (meta) => meta.getAttribute('content') ?? '',
    ),
  )
  if (declarations.errors.length)
    throw new Error(declarations.errors.join('; '))
  return declarations.capabilities.net
}
