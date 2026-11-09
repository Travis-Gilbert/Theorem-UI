// The frame end of a hosted page's bridge for component tests. Happy DOM does
// not execute iframe scripts, so this stands in for the frame: a real window
// and the production MessageChannel handshake, driving exactly the App bridge API.
import { spyOn } from 'bun:test'
import { Window } from 'happy-dom'
import { READY_MESSAGE, rpcOver, serve } from '@/lib/blocks/sandbox/protocol'
import type { SandboxMethods } from '@/lib/blocks/sandbox/protocol'
import { waitFor } from './render'

/** Connects to the first frame in `container`, as the frame's bridge would. */
export async function connectAppFrame(container: HTMLElement) {
  const frame = await waitFor(() => container.querySelector('iframe'), 10_000)
  // Page loading is disabled by the test browser; supply its window only.
  const child = new Window()
  Object.defineProperty(frame, 'contentWindow', { value: child })
  let port: MessagePort | undefined
  const post = spyOn(frame.contentWindow!, 'postMessage').mockImplementation(
    (
      _message: unknown,
      _origin?: string | WindowPostMessageOptions,
      transfer?: Transferable[],
    ) => {
      port = transfer?.[0] as MessagePort
    },
  )
  window.dispatchEvent(
    new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: READY_MESSAGE },
    }),
  )
  post.mockRestore()
  const rpc = rpcOver(port!)
  serve<SandboxMethods, 'state.changed'>(rpc, 'state.changed', async () => null)
  serve<SandboxMethods, 'theme.changed'>(rpc, 'theme.changed', async () => null)
  return { rpc, close: () => port!.close() }
}
