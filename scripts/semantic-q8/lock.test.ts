// The pins the stage script and the model route enforce must be the pins the
// vendored producer enforces in the browser, and the public paths must be the
// ones the client's asset module names.
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import lock from '../../vendor/semantic-q8/lock.json'
import { semanticQ8 } from '../../src/lib/semantic-q8/assets'

const here = (path: string) => new URL(`../../${path}`, import.meta.url)
// A computed specifier: the vendored file is plain JavaScript with no types.
const producerUrl = here('vendor/semantic-q8/semantic.js').href
const { PRODUCER } = (await import(producerUrl)) as {
  PRODUCER: {
    export: string
    export_revision: string
    runtime: { transformers: string; onnxruntime_web: string }
    model_files: Record<string, string>
    runtime_files: Record<string, string>
    dtype: { model: string; vision_encoder: string }
  }
}

describe('vendor/semantic-q8/lock.json', () => {
  test('pins the vendored producer byte for byte', async () => {
    const bytes = await readFile(here(lock.producer.file))
    expect(bytes.length).toBe(lock.producer.bytes)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      lock.producer.sha256,
    )
  })

  test('names exactly the model files and revision the producer admits', () => {
    expect(lock.model.repository).toBe(PRODUCER.export)
    expect(lock.model.revision).toBe(PRODUCER.export_revision)
    expect(lock.model.upstream).toBe(
      `https://huggingface.co/${PRODUCER.export}/resolve/${PRODUCER.export_revision}/`,
    )
    expect(
      Object.fromEntries(lock.model.files.map((f) => [f.name, f.sha256])),
    ).toEqual(PRODUCER.model_files)
    // Q8 weights only: no fp32 or audio file can be named by the pins.
    expect(PRODUCER.dtype).toEqual({ model: 'q8', vision_encoder: 'q8' })
    for (const file of lock.model.files)
      expect(file.name).not.toMatch(/audio|fp32|fp16/)
  })

  test('stages the plain CPU runtime the producer pins, never asyncify', () => {
    const runtime = lock.npm.find((pkg) => pkg.name === 'onnxruntime-web')!
    const transformers = lock.npm.find(
      (pkg) => pkg.name === '@huggingface/transformers',
    )!
    expect(runtime.version).toBe(PRODUCER.runtime.onnxruntime_web)
    expect(transformers.version).toBe(PRODUCER.runtime.transformers)
    const staged = Object.fromEntries(
      runtime.files.map((file) => [file.serve.split('/').pop(), file.sha256]),
    )
    expect(staged).toEqual({
      'ort-wasm-simd-threaded.mjs':
        PRODUCER.runtime_files['ort-wasm-simd-threaded.mjs'],
      'ort-wasm-simd-threaded.wasm':
        PRODUCER.runtime_files['ort-wasm-simd-threaded.wasm'],
    })
  })

  test('serves every file at the path the asset module names', () => {
    const served = [
      lock.producer.serve,
      ...lock.npm.flatMap((pkg) => pkg.files.map((file) => file.serve)),
    ]
    const urls = (path: string) => `/semantic/q8/${lock.version}/${path}`
    expect<string>(semanticQ8.version).toBe(lock.version)
    expect(served.map(urls)).toContain(semanticQ8.producerUrl)
    expect(served.map(urls)).toContain(semanticQ8.transformersUrl)
    for (const path of served.filter((p) => p.startsWith('runtime/')))
      expect(urls(path).startsWith(semanticQ8.runtimeBase)).toBe(true)
    expect<string>(semanticQ8.modelBase).toBe(urls('models/'))
  })

  test('keeps every code asset under a Worker static asset limit', () => {
    const limit = 25 * 1024 * 1024
    const code = [lock.producer, ...lock.npm.flatMap((pkg) => pkg.files)]
    for (const file of code) expect(file.bytes).toBeLessThan(limit)
    // The weights are why the model route exists.
    expect(lock.model.files.some((file) => file.bytes >= limit)).toBe(true)
  })
})
