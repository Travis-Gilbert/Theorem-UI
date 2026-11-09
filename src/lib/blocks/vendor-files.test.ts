import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Workers Builds starts from a clean checkout, which has only what git
// tracks: a vendored module that git ignores builds here and fails there.
test('git ignores none of the vendored modules', () => {
  const index = readFileSync(new URL('./vendor/modules.ts', import.meta.url), 'utf8')
  const files = [...index.matchAll(/from '\.\/(files\/[^'?]+)/g)].map(([, file]) => `vendor/${file}`)
  expect(files.length).toBeGreaterThan(0)
  const check = spawnSync('git', ['check-ignore', '--stdin'], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    input: files.join('\n'),
    encoding: 'utf8',
  })
  expect(check.stdout.split('\n').filter(Boolean)).toEqual([])
  // check-ignore exits 1 when it matched nothing, 128 when it could not run.
  expect(check.status).toBe(1)
})
