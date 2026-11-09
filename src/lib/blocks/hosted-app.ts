// Hosted documents use the same sandbox and bridge as desktop HTML Apps. They
// also take the page's look (sandbox/theme.ts): a host stylesheet ahead of the
// App's own content, kept current over the bridge by followTheme. The
// platform's MutationObserver watches the root's class, data-palette and style,
// as the IDE frame's and the terminal's colours follow them.
import type * as Esbuild from 'esbuild-wasm'
import { parseHtmlDeclarations } from './declarations'
import { connectSources, contentSecurityPolicy } from './document'
import type { FrameConnection } from './executor'
import { bundleAppBridge } from './export'
import { call } from './sandbox/protocol'
import type { SandboxMethods } from './sandbox/protocol'
import { THEME_STYLE, readAppTheme, themeCss } from './sandbox/theme'
import type { AppTheme } from './sandbox/theme'

let bridgeScript: Promise<string> | undefined

/**
 * `net` replaces the document's own `theorem:uses` declarations: a page
 * module reaches the hosts the person allowed it, whatever its page says.
 * `theme` is the look the frame starts with; the page's own by default.
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
export async function hostedAppDocument(
  html: string,
  esbuild?: Pick<typeof Esbuild, 'build'>,
  options: {
    net?: Array<string>
    loads?: Array<string>
    evaluates?: boolean
    theme?: AppTheme
  } = {},
): Promise<string> {
  const page = new DOMParser().parseFromString(html, 'text/html')
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
  const theme = page.createElement('style')
  theme.setAttribute(THEME_STYLE, '')
  theme.textContent = themeCss(options.theme ?? readAppTheme())
  const bridge = page.createElement('script')
  bridge.dataset.theoremAppBridge = ''
  bridge.textContent = esbuild
    ? await bundleAppBridge(esbuild)
    : await (bridgeScript ??= bundleAppBridge().catch((error) => {
        bridgeScript = undefined
        throw error
      }))
  // Install the host policy before any author content. The host stylesheet
  // comes first too, so every rule the App writes comes after it. The classic
  // IIFE exposes theorem.ready before the App's own scripts can execute.
  page.head.prepend(policy, theme, bridge)
  return `<!doctype html>\n${page.documentElement.outerHTML}`
}

/**
 * Sends a hosted App's frame the page's look once it connects and again
 * whenever it changes. Made to be a BlockFrame's `onConnection`; returns what
 * stops it.
 */
export function followTheme(connection: FrameConnection): () => void {
  let stop: (() => void) | undefined
  let active = true
  void connection.connected.then(
    (rpc) => {
      if (!active) return
      let sent = ''
      const send = () => {
        const theme = readAppTheme()
        const key = JSON.stringify(theme)
        if (key === sent) return
        sent = key
        void call<SandboxMethods, 'theme.changed'>(
          rpc,
          'theme.changed',
          theme,
        ).catch(() => {})
      }
      // The look may have changed while the frame loaded.
      send()
      const observer = new MutationObserver(send)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-palette', 'style'],
      })
      stop = () => observer.disconnect()
    },
    () => {},
  )
  return () => {
    active = false
    stop?.()
  }
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
