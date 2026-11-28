import { afterAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkOutput } from './check-output.mjs'

const dirs: Array<string> = []
afterAll(() =>
  Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))),
)
const output = async (layout: Record<string, number>) => {
  const dir = await mkdtemp(join(tmpdir(), 'semantic-q8-output-'))
  dirs.push(dir)
  for (const [name, bytes] of Object.entries(layout)) {
    const path = join(dir, name)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, '')
    await truncate(path, bytes)
  }
  return dir
}

test('accepts the code assets and a build with no Q8 at all', async () => {
  expect(
    await checkOutput(
      await output({
        'semantic/q8/v1/runtime/ort-wasm-simd-threaded.wasm': 14264838,
        'semantic/q8/v1/manifest.json': 2000,
      }),
    ),
  ).toEqual([])
  expect(await checkOutput(await output({ 'index.html': 10 }))).toEqual([])
})

test('refuses a model in the output, however it is named', async () => {
  const problems = await checkOutput(
    await output({
      'semantic/q8/v1/models/onnx-community/x/config.json': 5,
      'semantic/q8/v1/runtime/stray.onnx_data': 5,
    }),
  )
  expect(problems).toHaveLength(2)
})

test('refuses a Q8 asset at the Worker asset limit', async () => {
  const problems = await checkOutput(
    await output({ 'semantic/q8/v1/runtime/big.wasm': 25 * 1024 * 1024 }),
  )
  expect(problems).toEqual([
    'past the Worker asset limit: semantic/q8/v1/runtime/big.wasm',
  ])
})
