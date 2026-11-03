// SOURCING: Vite's `import.meta.glob` bundles OpenIDEA's own language definitions (the TOML files
// its Rust backend loads for the `languages` command) as raw text at build time. Kept in a module
// of its own because `import.meta.glob` exists only under Vite: the unit tests, which run under
// bun, substitute the same files read from disk (test/vite-globs.ts).

export const sources = import.meta.glob('../../vendor/openidea/languages/*.toml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
