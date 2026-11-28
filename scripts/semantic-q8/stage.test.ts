// Offline behavior of the staging script. A real stage downloads the pinned
// assets; `bun run semantic-q8:verify` checks a finished one against the pins.
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./stage.mjs', import.meta.url))
const scratch: Array<string> = []
afterAll(() =>
  Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true }))),
)

async function stage(...args: Array<string>) {
  const child = Bun.spawn(['bun', script, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { code: child.exitCode, out, err }
}

const empty = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'semantic-q8-stage-'))
  scratch.push(dir)
  return dir
}

describe('stage.mjs --verify', () => {
  test('refuses a directory with nothing staged', async () => {
    const result = await stage('--verify', '--out', await empty())
    expect(result.code).toBe(1)
    expect(result.err).toContain('missing: producer/semantic.js')
  })

  test('refuses a staged file that is not the pinned bytes', async () => {
    const dir = await empty()
    await mkdir(join(dir, 'producer'))
    await writeFile(join(dir, 'producer/semantic.js'), 'export {}\n')
    const result = await stage('--verify', '--out', dir)
    expect(result.code).toBe(1)
    expect(result.err).toContain('size_mismatch: producer/semantic.js')
  })

  test('refuses an unknown argument', async () => {
    const result = await stage('--shaper')
    expect(result.code).toBe(2)
  })
})
