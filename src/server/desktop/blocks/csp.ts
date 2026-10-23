// SOURCING: hand-rolled. A Content-Security-Policy is a header string; the
// directives are the ones plan D9 fixes for block documents. node:crypto
// hashes the inline import map, which `script-src` must name.
import { createHash } from 'node:crypto'

/** `'sha256-…'` for an inline script's exact text. */
export const scriptHash = (text: string) =>
  `'sha256-${createHash('sha256').update(text).digest('base64')}'`

/** `connect-src`: nothing, unless the block declared `net("host")`. */
export const connectSources = (hosts: Array<string>) =>
  hosts.length ? hosts.map((host) => `https://${host}`).join(' ') : "'none'"

const policy = (directives: Record<string, string>) =>
  Object.entries(directives)
    .map(([name, value]) => `${name} ${value}`)
    .join('; ')

interface PolicyInput {
  /** The block listener's origin, `http://127.0.0.1:<port>`. */
  origin: string
  /** The app's origin, the only page that may frame a block. */
  appOrigin: string
  net: Array<string>
}

/**
 * A cell document: scripts only from the listener's runtime, its vendored
 * modules and this one compiled cell, plus the inline import map by hash.
 */
export function cellPolicy({
  origin,
  appOrigin,
  net,
  cellPath,
  importMap,
}: PolicyInput & { cellPath: string; importMap: string }): string {
  return policy({
    'default-src': "'none'",
    'script-src': `${origin}/__runtime/ ${origin}/vendor/ ${origin}${cellPath} ${scriptHash(importMap)}`,
    'style-src': "'unsafe-inline'",
    'img-src': 'data: blob:',
    'font-src': 'data:',
    'media-src': 'data: blob:',
    'connect-src': connectSources(net),
    'form-action': "'none'",
    'base-uri': "'none'",
    'frame-ancestors': appOrigin,
  })
}

/**
 * An HTML app: its own files under its token, inline scripts and styles
 * (they run in the same opaque sandbox as its files), the runtime and the
 * vendored modules. Data comes through `theorem.files`, never `fetch`.
 */
export function appPolicy({
  origin,
  appOrigin,
  net,
  appPath,
}: PolicyInput & { appPath: string }): string {
  const own = `${origin}${appPath}`
  return policy({
    'default-src': "'none'",
    'script-src': `'unsafe-inline' ${own} ${origin}/__runtime/ ${origin}/vendor/`,
    'style-src': `'unsafe-inline' ${own}`,
    'img-src': `${own} data: blob:`,
    'font-src': `${own} data:`,
    'media-src': `${own} data: blob:`,
    'connect-src': connectSources(net),
    'form-action': "'none'",
    'base-uri': "'none'",
    'frame-ancestors': appOrigin,
  })
}
