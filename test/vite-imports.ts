// Lets bun test load Vite's `?raw` (a file's text) and `?url` (its location)
// imports, which the block listener and the formula worker use. A Bun runtime
// plugin (Bun's documented `plugin` API), resolving the file without the query.
import path from 'node:path'
import { plugin } from 'bun'

plugin({
  name: 'vite-query-imports',
  setup(build) {
    build.onResolve({ filter: /\?(raw|url)$/ }, (args) => {
      const [specifier = '', query = ''] = args.path.split('?')
      const file = specifier.startsWith('.')
        ? path.resolve(path.dirname(args.importer), specifier)
        : Bun.resolveSync(specifier, path.dirname(args.importer))
      return { path: `${file}?${query}`, namespace: 'vite-query' }
    })
    build.onLoad({ filter: /.*/, namespace: 'vite-query' }, async (args) => {
      const [file = '', query] = args.path.split('?')
      return {
        exports: {
          default: query === 'raw' ? await Bun.file(file).text() : file,
        },
        loader: 'object',
      }
    })
  },
})
