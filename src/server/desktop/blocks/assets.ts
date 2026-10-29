// SOURCING: sucrase (the sandbox runtime is TypeScript in src/lib/blocks/
// sandbox; types are stripped once, when the server starts) over the sources
// runtime-sources.ts puts in the server bundle. The vendored modules come
// from src/lib/blocks/vendor, written by scripts/vendor-block-modules.ts.
import { transform } from 'sucrase'
import { runtimeSources } from '#/lib/blocks/runtime-sources'
import { importMap } from '#/lib/blocks/vendor/manifest'
import { vendorModules } from '#/lib/blocks/vendor/modules'

let runtime: Map<string, string> | null = null

/**
 * The sandbox runtime's modules by name, served at `/__runtime/<name>`.
 * They import one another as `./name`, which resolves to that same path.
 */
export function runtimeModules(): Map<string, string> {
  runtime ??= new Map(
    Object.entries(runtimeSources).map(([name, source]) => [
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
