import type {
  Q8Embedding,
  Q8Identity,
  Q8Input,
  Q8Reply,
  Q8Request,
} from './encoder-protocol'

// Bounds a wedged worker, not the narrower deadline a chat caller may supply.
const BOOT_TIMEOUT_MS = 180_000
const MAX_PENDING = 16

type Pending = {
  signal: AbortSignal
  onAbort: () => void
  resolve: (value: Q8Embedding) => void
  reject: (reason: unknown) => void
}

type EncoderPort = Pick<Worker, 'addEventListener' | 'terminate'> & {
  postMessage: (message: Q8Request) => void
}

type Session = {
  port: EncoderPort
  pending: Map<number, Pending>
  identity?: Q8Identity
  timeout: ReturnType<typeof setTimeout>
}

export class Q8Error extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

/** Lazy, single resident producer. A failed worker can be started by a later query. */
export function createBrowserEncoder(start: () => EncoderPort) {
  let session: Session | undefined
  let nextId = 0

  function take(current: Session, id: number) {
    const job = current.pending.get(id)
    if (job) {
      current.pending.delete(id)
      job.signal.removeEventListener('abort', job.onAbort)
    }
    return job
  }

  function stop(current: Session, code: string) {
    if (session !== current) return
    session = undefined
    clearTimeout(current.timeout)
    current.port.terminate()
    for (const id of current.pending.keys())
      take(current, id)?.reject(new Q8Error(code))
  }

  function boot(): Session {
    let port: EncoderPort
    try {
      port = start()
    } catch {
      throw new Q8Error('runtime_unavailable')
    }
    const current: Session = {
      port,
      pending: new Map(),
      timeout: setTimeout(
        () => stop(current, 'semantic_start_timeout'),
        BOOT_TIMEOUT_MS,
      ),
    }
    port.addEventListener('error', () => stop(current, 'runtime_unavailable'))
    port.addEventListener('messageerror', () =>
      stop(current, 'runtime_unavailable'),
    )
    port.addEventListener('message', ({ data }: MessageEvent<Q8Reply>) => {
      if (session !== current) return
      switch (data.type) {
        case 'ready':
          current.identity = data.identity
          clearTimeout(current.timeout)
          break
        case 'unavailable':
          stop(current, data.code)
          break
        case 'refused':
          take(current, data.id)?.reject(new Q8Error(data.code))
          break
        case 'encoded': {
          const identity = current.identity
          if (!identity) {
            stop(current, 'runtime_unavailable')
            return
          }
          take(current, data.id)?.resolve({ identity, vector: data.vector })
        }
      }
    })
    return current
  }

  return {
    get ready() {
      return session?.identity !== undefined
    },
    async encode(input: Q8Input, signal: AbortSignal): Promise<Q8Embedding> {
      signal.throwIfAborted()
      const current = (session ??= boot())
      if (current.pending.size >= MAX_PENDING) throw new Q8Error('worker_busy')
      const id = ++nextId
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          const job = take(current, id)
          if (!job) return
          job.reject(signal.reason)
          if (!current.identity && current.pending.size === 0) {
            stop(current, 'semantic_closed')
            return
          }
          try {
            current.port.postMessage({ type: 'cancel', id })
          } catch {
            stop(current, 'runtime_unavailable')
          }
        }
        current.pending.set(id, { signal, onAbort, resolve, reject })
        signal.addEventListener('abort', onAbort, { once: true })
        try {
          current.port.postMessage({ type: 'encode', id, input })
        } catch {
          stop(current, 'runtime_unavailable')
        }
      })
    },
    close() {
      if (session) stop(session, 'semantic_closed')
    },
  }
}

export const browserEncoder = createBrowserEncoder(
  () =>
    new Worker(new URL('./encoder.worker.ts', import.meta.url), {
      type: 'module',
      name: 'theorem-semantic-q8',
    }),
)
