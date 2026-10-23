// SOURCING: sucrase (the sandbox runtime is TypeScript in src/lib/blocks/
// sandbox; types are stripped once, when the server starts) and Vite's `?raw`
// imports, which put the sources in the server bundle. The vendored modules
// come from src/lib/blocks/vendor, written by scripts/vendor-block-modules.ts.
import { transform } from 'sucrase'
import appBridge from '../../../lib/blocks/sandbox/app-bridge.ts?raw'
import cell from '../../../lib/blocks/sandbox/cell.ts?raw'
import cellRuntime from '../../../lib/blocks/sandbox/cell-runtime.ts?raw'
import connect from '../../../lib/blocks/sandbox/connect.ts?raw'
import display from '../../../lib/blocks/sandbox/display.ts?raw'
import protocol from '../../../lib/blocks/sandbox/protocol.ts?raw'
import values from '../../../lib/blocks/sandbox/values.ts?raw'
import { importMap } from '#/lib/blocks/vendor/manifest'
import { vendorModules } from '#/lib/blocks/vendor/modules'

const sources: Record<string, string> = {
  'app-bridge': appBridge,
  cell,
  'cell-runtime': cellRuntime,
  connect,
  display,
  protocol,
  values,
}

let runtime: Map<string, string> | null = null

/**
 * The sandbox runtime's modules by name, served at `/__runtime/<name>`.
 * They import one another as `./name`, which resolves to that same path.
 */
export function runtimeModules(): Map<string, string> {
  runtime ??= new Map(
    Object.entries(sources).map(([name, source]) => [
      name,
      transform(source, {
        transforms: ['typescript'],
        disableESTransforms: true,
      }).code,
    ]),
  )
  return runtime
}

/** A vendored module's text by its served path, `/vendor/…`. */
export const vendorModule = (path: string): string | undefined =>
  Object.hasOwn(vendorModules, path) ? vendorModules[path] : undefined

/** The import map as the inline script every block document carries. */
export const importMapScript = JSON.stringify(importMap)
