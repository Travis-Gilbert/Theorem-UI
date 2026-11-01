// `import.meta.glob` is a Vite feature; bun has none. The one place the host uses it is
// src/host/language-sources.ts, so a test run substitutes the same files read from disk.
import { mock } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const directory = join(import.meta.dir, '..', 'vendor', 'openidea', 'languages')

mock.module('../src/host/language-sources', () => ({
  sources: Object.fromEntries(
    readdirSync(directory)
      .filter((name) => name.endsWith('.toml'))
      .map((name) => [`../../vendor/openidea/languages/${name}`, readFileSync(join(directory, name), 'utf8')]),
  ),
}))
