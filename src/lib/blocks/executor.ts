// SOURCING: the platform's MessageChannel and postMessage. A block runs in a
// sandboxed iframe served by the block listener (plan D9); the page hands it
// one MessagePort and serves its bridge over that port and nothing else.
import { serveBridge } from './bridge'
import type { BridgeHost } from './bridge'
import { CellContext } from './sandbox/cell'
import type { CellModule, Display } from './sandbox/cell'
import { CONNECT_MESSAGE, READY_MESSAGE, call, rpcOver, serve } from './sandbox/protocol'
import type { Rpc, RunOutcome, SandboxMethods } from './sandbox/protocol'

/** Something that runs one block with the values it reads. */
export interface CellExecutor {
  run: (inputs: Record<string, unknown>) => Promise<RunOutcome>
  dispose: () => void
}

/** The sandbox attribute every block frame gets: scripts, and nothing else. */
export const BLOCK_SANDBOX = 'allow-scripts'

/**
 * The page's end of a block frame. Only the frame's own window may ask for
 * the port, and only once: a frame that loads anything else afterwards (its
 * code navigated it) is cut off rather than handed a second bridge.
 */
export class FrameConnection {
  private rpc: Rpc | null = null
  private stopBridge: (() => void) | null = null
  private loads = 0
  private closed = false
  private resolveConnected: (rpc: Rpc) => void = () => {}
  private rejectConnected: (error: Error) => void = () => {}
  readonly connected: Promise<Rpc>

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly host: BridgeHost,
    private readonly onLost: () => void = () => {},
  ) {
    this.connected = new Promise((resolve, reject) => {
      this.resolveConnected = resolve
      this.rejectConnected = reject
    })
    // A rejection nobody awaited yet is not an error to report.
    this.connected.catch(() => {})
    window.addEventListener('message', this.onMessage)
    frame.addEventListener('load', this.onLoad)
  }

  private onMessage = (event: MessageEvent) => {
    if (event.source !== this.frame.contentWindow || this.closed) return
    if ((event.data as { type?: unknown } | null)?.type !== READY_MESSAGE)
      return
    if (this.rpc) {
      this.lose('The block document asked to connect twice')
      return
    }
    const channel = new MessageChannel()
    this.rpc = rpcOver(channel.port1)
    this.stopBridge = serveBridge(this.rpc, this.host)
    // The frame's origin is opaque, so no narrower target origin exists; the
    // port goes to this frame's window only.
    this.frame.contentWindow?.postMessage({ type: CONNECT_MESSAGE }, '*', [
      channel.port2,
    ])
    this.resolveConnected(this.rpc)
  }

  private onLoad = () => {
    this.loads++
    if (this.loads > 1) this.lose('The block document navigated away')
  }

  private lose(reason: string) {
    if (this.closed) return
    this.dispose()
    this.rejectConnected(new Error(reason))
    this.onLost()
  }

  run = async (inputs: Record<string, unknown>): Promise<RunOutcome> => {
    const rpc = await this.connected
    return call<SandboxMethods, 'cell.run'>(rpc, 'cell.run', {
      runId: Date.now(),
      inputs,
    })
  }

  dispose = () => {
    this.closed = true
    window.removeEventListener('message', this.onMessage)
    this.frame.removeEventListener('load', this.onLoad)
    this.stopBridge?.()
    this.rpc?.rejectAllPendingRequests('The block frame closed')
  }
}

/**
 * Runs a compiled cell in this realm over a real MessageChannel, through the
 * same bridge a frame gets. Tests use it where there is no block listener to
 * load a frame from; it is not a sandbox.
 */
export function inProcessExecutor(
  module: CellModule,
  host: BridgeHost,
  display: Display = { show: () => {}, clear: () => {} },
): CellExecutor {
  const channel = new MessageChannel()
  const page = rpcOver(channel.port1)
  const stopBridge = serveBridge(page, host)
  const sandbox = rpcOver(channel.port2)
  const context = new CellContext(sandbox, display)
  serve<SandboxMethods, 'cell.run'>(sandbox, 'cell.run', ({ inputs }) =>
    context.run(module, inputs),
  )
  serve<SandboxMethods, 'state.changed'>(
    sandbox,
    'state.changed',
    async ({ name, value }) => {
      await context.changed(name, value)
      return null
    },
  )
  return {
    run: (inputs) =>
      call<SandboxMethods, 'cell.run'>(page, 'cell.run', {
        runId: Date.now(),
        inputs,
      }),
    dispose: () => {
      stopBridge()
      channel.port1.close()
      channel.port2.close()
    },
  }
}
