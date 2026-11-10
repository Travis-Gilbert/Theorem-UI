// Hosted documents use the same sandbox and bridge as desktop HTML Apps.
import type * as Esbuild from 'esbuild-wasm'
import { readAppSources, removeAppSources } from './app-source'
import { parseHtmlDeclarations } from './declarations'
import { connectSources, contentSecurityPolicy } from './document'
import { bundleAppBridge, bundleAppSources } from './export'

let bridgeScript: Promise<string> | undefined

/**
 * `net` replaces the document's own `theorem:uses` declarations: a page
 * module reaches the hosts the person allowed it, whatever its page says.
 *
 * `loads` names hosts the page may run code from: their scripts, workers,
 * styles and fonts, and the WebAssembly they compile. Only a runtime the
 * person started asks for it (a marimo notebook's Pyodide); every other
 * hosted page runs only what it carries.
 *
 * `evaluates` lets the page's own code build functions from strings, as
 * d3-dsv builds its row readers. The frame's sandbox and network policy are
 * the boundary; code it carries could run the same function inline.
 */
export interface HostedAppOptions {
  net?: Array<string>
  loads?: Array<string>
  evaluates?: boolean
}

/** What tracing a failure in a built App back to its source needs. */
export interface HostedBuild {
  /** The bundle's source map: the App's own files, by their paths. */
  map: string
  /**
   * The line of the page the bundle's script tag is on. The bundle's first
   * line is the one after it, at column zero.
   */
  scriptLine: number
}

/** A hosted page, and how it was built when it carries TypeScript source. */
export interface HostedApp {
  page: string
  build?: HostedBuild
}

/** The attribute on the script that holds a built App's bundle, and on its map. */
const BUNDLE = 'data-theorem-app-bundle'
const MAP = 'data-theorem-app-map'
const BUNDLE_TAG = `<script type="module" ${BUNDLE}`
const MAP_TAG = `<script type="application/json" ${MAP}="">`

/**
 * How a hosted page was built, read from the page: a built App carries its
 * own map, so a failure in it can be traced with nothing but the page.
 */
export function hostedBuild(page: string): HostedBuild | undefined {
  const tag = page.lastIndexOf(BUNDLE_TAG)
  const start = page.lastIndexOf(MAP_TAG, tag)
  if (tag < 0 || start < 0) return undefined
  const from = start + MAP_TAG.length
  return {
    map: page.slice(from, page.indexOf('</script>', from)),
    scriptLine: page.slice(0, tag).split('\n').length,
  }
}

/** The hosted page alone. See {@link hostedApp}. */
export async function hostedAppDocument(
  html: string,
  esbuild?: Pick<typeof Esbuild, 'build'>,
  options: HostedAppOptions = {},
): Promise<string> {
  return (await hostedApp(html, esbuild, options)).page
}

/**
 * The document an App's frame loads: the App's own page under this app's
 * policy, with the bridge first. A page that carries TypeScript source
 * (app-source.ts) is built here: its source scripts are replaced by one
 * module, after everything else in the body. A source that does not build is
 * an `AppBuildError`.
 */
export async function hostedApp(
  html: string,
  esbuild?: Pick<typeof Esbuild, 'build'>,
  options: HostedAppOptions = {},
): Promise<HostedApp> {
  const page = new DOMParser().parseFromString(html, 'text/html')
  const appSources = readAppSources(page)
  const bundle = appSources && (await bundleAppSources(appSources, esbuild))
  const net = options.net ?? declaredNet(page)
  const loads = (options.loads ?? []).map((host) => `https://${host}`)
  const from = (...sources: Array<string>) => [...sources, ...loads].join(' ')
  const policy = page.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = contentSecurityPolicy({
    'default-src': "'none'",
    'script-src': loads.length
      ? from("'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", 'blob:')
      : options.evaluates
        ? "'unsafe-inline' 'unsafe-eval'"
        : "'unsafe-inline'",
    ...(loads.length && { 'worker-src': from('blob:') }),
    'style-src': from("'unsafe-inline'"),
    'img-src': 'data: blob:',
    'font-src': from('data:'),
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
  if (!appSources || !bundle)
    return { page: `<!doctype html>\n${page.documentElement.outerHTML}` }
  removeAppSources(page)
  if (bundle.css) {
    const style = page.createElement('style')
    style.textContent = bundle.css
    page.head.append(style)
  }
  const map = page.createElement('script')
  map.type = 'application/json'
  map.setAttribute(MAP, '')
  // JSON, with nothing in it that could end the element early.
  map.textContent = bundle.map.replaceAll('<', '\\u003c')
  const script = page.createElement('script')
  script.type = 'module'
  script.setAttribute(BUNDLE, '')
  // On a line of its own, so a failure's line and column are the bundle's.
  script.textContent = `\n${bundle.code}`
  page.body.append(map, script)
  const text = `<!doctype html>\n${page.documentElement.outerHTML}`
  return { page: text, build: hostedBuild(text) }
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
