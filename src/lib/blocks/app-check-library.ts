// SOURCING: Vite's `import.meta.glob` with `?raw` (a package's declaration
// files as text, in a chunk loaded only when an App is checked). The packages
// are this app's own dependencies, so an App is checked against the React it
// is built with; `@theorem/app` is written from the bridge's source by
// scripts/app-declarations.ts.
import type { CheckLibrary } from './app-check'
import { theoremAppDeclarations } from './check/theorem-app.generated'

const packages = import.meta.glob<string>(
  [
    '/node_modules/@types/react/**/*.d.ts',
    '/node_modules/@types/react/package.json',
    '/node_modules/@types/react-dom/**/*.d.ts',
    '/node_modules/@types/react-dom/package.json',
    '/node_modules/csstype/**/*.d.ts',
    '/node_modules/csstype/package.json',
  ],
  { query: '?raw', import: 'default' },
)

let library: Promise<CheckLibrary> | undefined

/** The declarations an App is checked against, read once. */
export function checkLibrary(): Promise<CheckLibrary> {
  library ??= (async () => {
    const files: CheckLibrary = {}
    await Promise.all(
      Object.entries(packages).map(async ([path, load]) => {
        files[path] = await load()
      }),
    )
    for (const [name, text] of Object.entries(theoremAppDeclarations))
      files[`/node_modules/@theorem/app/${name}`] = text
    return files
  })()
  library.catch(() => {
    library = undefined
  })
  return library
}
