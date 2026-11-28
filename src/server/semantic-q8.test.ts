import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test'
import { mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import lock from '../../vendor/semantic-q8/lock.json'
import { semanticQ8Model } from './semantic-q8'
import type { SemanticQ8Bucket } from './semantic-q8'

const base = `http://app.test/semantic/q8/v1/models/${lock.model.repository}/`
const weights = lock.model.files.find((file) =>
  file.name.endsWith('model_quantized.onnx_data'),
)!
const config = lock.model.files.find((file) => file.name === 'config.json')!
const get = (name: string, init?: RequestInit) =>
  new Request(`${base}${name}`, init)

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'semantic-q8-test-'))
  // Every pinned file at its pinned size; the large ones are sparse.
  for (const file of lock.model.files) {
    const path = join(dir, 'models', lock.model.repository, file.name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '')
    await truncate(path, file.bytes)
  }
  // A recognizable head on the weights.
  const writer = Bun.file(
    join(dir, 'models', lock.model.repository, weights.name),
  ).writer()
  writer.write(new Uint8Array([1, 2, 3, 4]))
  await writer.end()
})
afterAll(() => rm(dir, { recursive: true, force: true }))

describe('local directory', () => {
  test('streams a pinned file with same-origin headers', async () => {
    const response = await semanticQ8Model(get(weights.name), {
      kind: 'directory',
      dir,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(String(weights.bytes))
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('cross-origin-resource-policy')).toBe(
      'same-origin',
    )
    // Read one chunk of a 313 MB body and stop: it is not held in memory.
    const reader = response.body!.getReader()
    const first = await reader.read()
    expect([...first.value!.subarray(0, 4)]).toEqual([1, 2, 3, 4])
    expect(first.value!.byteLength).toBeLessThan(weights.bytes)
    await reader.cancel()
  })

  test('HEAD has the length and no body', async () => {
    const head = await semanticQ8Model(get(weights.name, { method: 'HEAD' }), {
      kind: 'directory',
      dir,
    })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe(String(weights.bytes))
    expect(head.body).toBeNull()
  })

  test('answers only pinned names, only GET and HEAD', async () => {
    for (const name of [
      'onnx/audio_encoder_quantized.onnx',
      '../../etc/passwd',
      '%2e%2e/%2e%2e/lock.json',
      'onnx/',
      '%',
    ]) {
      const response = await semanticQ8Model(get(name), {
        kind: 'directory',
        dir,
      })
      expect(response.status).toBe(404)
    }
    const other = await semanticQ8Model(
      new Request('http://app.test/semantic/q8/v1/models/other/config.json'),
      { kind: 'directory', dir },
    )
    expect(other.status).toBe(404)
    const post = await semanticQ8Model(get(config.name, { method: 'POST' }), {
      kind: 'directory',
      dir,
    })
    expect(post.status).toBe(405)
  })

  test('refuses a missing file and a file of another size', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'semantic-q8-empty-'))
    try {
      const missing = await semanticQ8Model(get(config.name), {
        kind: 'directory',
        dir: empty,
      })
      expect(missing.status).toBe(404)
      expect(await missing.json()).toEqual({ error: 'model_not_installed' })
      const path = join(empty, 'models', lock.model.repository, config.name)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, 'short')
      const wrong = await semanticQ8Model(get(config.name), {
        kind: 'directory',
        dir: empty,
      })
      expect(wrong.status).toBe(500)
      expect(await wrong.json()).toEqual({ error: 'model_file_size_mismatch' })
    } finally {
      await rm(empty, { recursive: true, force: true })
    }
  })

  test('without local files the model is not installed', async () => {
    const response = await semanticQ8Model(get(config.name), {
      kind: 'directory',
      dir: join(dir, 'absent'),
    })
    expect(response.status).toBe(404)
  })
})

describe('private R2 binding', () => {
  const key = (name: string) =>
    `q8/v1/${lock.model.revision}/${lock.model.repository}/${name}`
  const signIn = async () => true
  const emptyBucket = () => ({
    head: mock<SemanticQ8Bucket['head']>(async () => null),
    get: mock<SemanticQ8Bucket['get']>(async () => null),
  })

  test('the cookie gate rejects signed-out and failed sessions before touching R2', async () => {
    const bucket = emptyBucket()
    for (const method of ['GET', 'HEAD']) {
      const response = await semanticQ8Model(
        get(config.name, {
          method,
          headers: { authorization: 'Bearer not-a-person-cookie' },
        }),
        {
          kind: 'r2',
          bucket,
          signedIn: async () => false,
        },
      )
      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
    const failed = await semanticQ8Model(get(config.name), {
      kind: 'r2',
      bucket,
      signedIn: async () => {
        throw new Error('session invalid')
      },
    })
    expect(failed.status).toBe(401)
    expect(bucket.head).not.toHaveBeenCalled()
    expect(bucket.get).not.toHaveBeenCalled()
  })

  test('signed-in GET streams the exact key and HEAD does not open its body', async () => {
    const bucket = emptyBucket()
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>()
    bucket.get.mockResolvedValue({ size: weights.bytes, body })
    bucket.head.mockResolvedValue({ size: weights.bytes })
    const head = await semanticQ8Model(get(weights.name, { method: 'HEAD' }), {
      kind: 'r2',
      bucket,
      signedIn: signIn,
    })
    expect(head.status).toBe(200)
    expect(head.body).toBeNull()
    expect(head.headers.get('content-length')).toBe(String(weights.bytes))
    expect(bucket.head).toHaveBeenCalledWith(key(weights.name))
    expect(bucket.get).not.toHaveBeenCalled()
    const response = await semanticQ8Model(get(weights.name), {
      kind: 'r2',
      bucket,
      signedIn: signIn,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('cross-origin-resource-policy')).toBe(
      'same-origin',
    )
    expect(response.body).toBe(body)
    expect(bucket.get).toHaveBeenCalledWith(key(weights.name))
    await response.body?.cancel()
  })

  test('an unlisted name never reaches storage, and no binding means no model', async () => {
    const bucket = emptyBucket()
    const bad = await semanticQ8Model(get('onnx/unknown.onnx'), {
      kind: 'r2',
      bucket,
      signedIn: signIn,
    })
    const unconfigured = await semanticQ8Model(get(config.name), {
      kind: 'r2',
      bucket: undefined,
      signedIn: signIn,
    })
    expect(bad.status).toBe(404)
    expect(unconfigured.status).toBe(404)
    expect(bucket.get).not.toHaveBeenCalled()
  })

  test('missing, corrupt and unavailable objects do not return model bytes', async () => {
    const bucket = emptyBucket()
    const source = { kind: 'r2', bucket, signedIn: signIn } as const
    expect((await semanticQ8Model(get(config.name), source)).status).toBe(404)
    const cancel = mock(() => {})
    const body = new ReadableStream({ cancel })
    bucket.get.mockResolvedValueOnce({ size: 1, body })
    const wrong = await semanticQ8Model(get(config.name), source)
    expect(wrong.status).toBe(502)
    expect(await wrong.json()).toEqual({ error: 'model_file_size_mismatch' })
    expect(cancel).toHaveBeenCalledTimes(1)
    bucket.get.mockRejectedValueOnce(new Error('offline'))
    const unavailable = await semanticQ8Model(get(config.name), source)
    expect(unavailable.status).toBe(502)
    expect(await unavailable.json()).toEqual({
      error: 'model_store_unavailable',
    })
  })
})
