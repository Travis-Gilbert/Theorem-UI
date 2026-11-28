// SOURCING: the pinned file table in vendor/semantic-q8/lock.json; Nitro's
// lazy server routes as in files-proxy.ts.
//
// Serves the browser Q8 producer's model files at
// /semantic/q8/v1/models/<repository>/<file>, same-origin, and nothing else.
// Cloudflare streams from a private R2 binding after checking the signed-in
// session. Bun streams from a staged local directory. The producer verifies
// each whole file with Subresource Integrity before using it.
import { defineHandler } from 'nitro'
import { getCookie } from 'nitro/h3'
import type { ServerRequest } from 'srvx'
import lock from '../../vendor/semantic-q8/lock.json'
import { hasActivePersonSession } from './theorem-auth'

const PREFIX = `/semantic/q8/${lock.version}/models/${lock.model.repository}/`
const FILES = new Map(lock.model.files.map((file) => [file.name, file]))
const R2_PREFIX = `q8/${lock.version}/${lock.model.revision}/${lock.model.repository}/`

type ModelFile = (typeof lock.model.files)[number]

/** The subset of the Workers R2 binding used by the download handler. */
export interface SemanticQ8Bucket {
  head: (key: string) => Promise<{ size: number } | null>
  get: (key: string) => Promise<{ size: number; body: ReadableStream } | null>
}

declare module 'srvx' {
  interface CloudflareEnv {
    THEOREM_Q8_MODELS?: SemanticQ8Bucket
  }
}

type ModelSource =
  | { kind: 'directory'; dir: string }
  | {
      kind: 'r2'
      bucket: SemanticQ8Bucket | undefined
      signedIn: () => Promise<boolean>
    }

function contentType(name: string): string {
  if (name.endsWith('.json')) return 'application/json'
  if (name.endsWith('.jinja')) return 'text/plain; charset=utf-8'
  return 'application/octet-stream'
}

function baseHeaders(file: ModelFile): Headers {
  return new Headers({
    'Cache-Control': 'private, no-store',
    'Content-Length': String(file.bytes),
    'Content-Type': contentType(file.name),
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
  })
}

const refuse = (status: number, code: string) =>
  new Response(JSON.stringify({ error: code }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })

async function fromDirectory(
  request: Request,
  file: ModelFile,
  dir: string,
): Promise<Response> {
  const { createReadStream } = await import('node:fs')
  const { stat } = await import('node:fs/promises')
  const { Readable } = await import('node:stream')
  const { join, resolve } = await import('node:path')
  const path = join(
    resolve(dir),
    'models',
    lock.model.repository,
    ...file.name.split('/'),
  )
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) return refuse(404, 'model_not_installed')
  // A truncated or swapped file must not be served as the pinned one.
  if (info.size !== file.bytes) return refuse(500, 'model_file_size_mismatch')
  const headers = baseHeaders(file)
  if (request.method === 'HEAD') return new Response(null, { headers })
  const stream = createReadStream(path)
  // A closed connection stops the read instead of leaving the file open.
  request.signal.addEventListener('abort', () => stream.destroy(), {
    once: true,
  })
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers,
  })
}

async function fromBucket(
  request: Request,
  file: ModelFile,
  { bucket, signedIn }: Extract<ModelSource, { kind: 'r2' }>,
): Promise<Response> {
  if (!bucket) return refuse(404, 'model_not_installed')
  if (!(await signedIn().catch(() => false)))
    return refuse(401, 'sign_in_required')
  const key = `${R2_PREFIX}${file.name}`
  try {
    if (request.method === 'HEAD') {
      const object = await bucket.head(key)
      if (!object) return refuse(404, 'model_not_installed')
      if (object.size !== file.bytes)
        return refuse(502, 'model_file_size_mismatch')
      return new Response(null, { headers: baseHeaders(file) })
    }
    const object = await bucket.get(key)
    if (!object) return refuse(404, 'model_not_installed')
    if (object.size !== file.bytes) {
      await object.body.cancel().catch(() => {})
      return refuse(502, 'model_file_size_mismatch')
    }
    return new Response(object.body, { headers: baseHeaders(file) })
  } catch {
    return refuse(502, 'model_store_unavailable')
  }
}

/** The model file the pinned table names, or a refusal. */
export async function semanticQ8Model(
  request: Request,
  source: ModelSource,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  const { pathname } = new URL(request.url)
  if (!pathname.startsWith(PREFIX)) return refuse(404, 'model_not_installed')
  let name: string
  try {
    name = decodeURIComponent(pathname.slice(PREFIX.length))
  } catch {
    return refuse(404, 'model_not_installed')
  }
  // Only a pinned name exists; a path is never joined from the request.
  const file = FILES.get(name)
  if (!file) return refuse(404, 'model_not_installed')
  return source.kind === 'r2'
    ? fromBucket(request, file, source)
    : fromDirectory(request, file, source.dir)
}

export default defineHandler((event) => {
  const runtime = (event.req as ServerRequest).runtime?.cloudflare
  return semanticQ8Model(
    event.req,
    runtime
      ? {
          kind: 'r2',
          bucket: runtime.env.THEOREM_Q8_MODELS,
          signedIn: () =>
            hasActivePersonSession((name) => getCookie(event, name)),
        }
      : {
          kind: 'directory',
          dir:
            process.env.THEOREM_SEMANTIC_Q8_DIR ||
            `.semantic-q8/${lock.version}`,
        },
  )
})
