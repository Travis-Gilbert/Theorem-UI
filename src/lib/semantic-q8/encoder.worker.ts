// Vite's module worker isolates ONNX initialization and inference from the page.
// The versioned asset URLs are absolute; the qualified producer verifies the
// model and ONNX runtime files against its pinned hashes.
import { semanticQ8 } from './assets'
import { createEncodeQueue } from './encode-queue'
import type {
  Q8Identity,
  Q8Input,
  Q8Reply,
  Q8Request,
} from './encoder-protocol'

type Producer = {
  ready: Promise<{ identity: Q8Identity }>
  encode: (input: Q8Input) => Promise<Float32Array<ArrayBuffer>>
}

const reply = (message: Q8Reply, transfers: Transferable[] = []) =>
  self.postMessage(message, { transfer: transfers })

function codeOf(error: unknown) {
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[a-z][a-z0-9_]{0,63}$/.test(error.code)
  )
    return error.code
  return 'runtime_unavailable'
}

async function loadProducer(): Promise<Producer> {
  const [semantic, transformers] = await Promise.all([
    import(/* @vite-ignore */ semanticQ8.producerUrl),
    import(/* @vite-ignore */ semanticQ8.transformersUrl),
  ])
  // This app doesn't opt every page into COOP/COEP. The plain WASM CPU build
  // includes the GatherBlockQuantized kernel this Q8 export needs.
  transformers.env.backends.onnx.wasm.numThreads = 1
  const producer: Producer = semantic.createProducer({
    transformers,
    modelBase: semanticQ8.modelBase,
    runtimeBase: semanticQ8.runtimeBase,
    device: 'wasm',
  })
  const { identity } = await producer.ready
  reply({ type: 'ready', identity })
  return producer
}

let producer: Promise<Producer> | undefined
const queue = createEncodeQueue(
  async (
    { id, input }: { id: number; input: Q8Input; foreground: boolean },
    canceled,
  ) => {
    // Initialization belongs to the first submitted encode. No assets are
    // loaded by creating the tab or the app shell.
    producer ??= loadProducer()
    let ready: Producer
    try {
      ready = await producer
    } catch (error) {
      reply({ type: 'unavailable', code: codeOf(error) })
      return
    }
    if (canceled()) return
    try {
      const vector = await ready.encode(input)
      if (!canceled()) reply({ type: 'encoded', id, vector }, [vector.buffer])
    } catch (error) {
      if (!canceled()) reply({ type: 'refused', id, code: codeOf(error) })
    }
  },
)

self.addEventListener('message', ({ data }: MessageEvent<Q8Request>) => {
  if (data.type === 'cancel') queue.cancel(data.id)
  else queue.add({ ...data, foreground: data.input.task === 'search_query' })
})
