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
    // Vite takes a package's ES `module` build before its `main`; Bun takes
    // `main`. prosemirror-autocomplete's `main` is CommonJS, which loads a
    // second prosemirror-view beside the ES one Milkdown's editor view uses,
    // and that view cannot read the other copy's decorations. So its CommonJS
    // entry loads as its ES build.
    build.onLoad(
      { filter: /\/prosemirror-autocomplete\/dist\/cjs\/index\.js$/ },
      async (args) => ({
        exports: await import(args.path.replace('/dist/cjs/', '/dist/esm/')),
        loader: 'object',
      }),
    )
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
