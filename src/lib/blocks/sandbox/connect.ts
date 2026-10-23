// SOURCING: the platform's postMessage and MessageChannel. The handshake is
// this app's own: the sandbox document says it is ready, and only its parent
// frame may answer with the port the bridge runs over.
import { CONNECT_MESSAGE, READY_MESSAGE } from './protocol'

/** Waits for the page to hand this document its port. */
export function connectToPage(): Promise<MessagePort> {
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown } | null
      const [port] = event.ports
      if (event.source !== window.parent || data?.type !== CONNECT_MESSAGE)
        return
      if (!port) return
      window.removeEventListener('message', onMessage)
      resolve(port)
    }
    window.addEventListener('message', onMessage)
    // The parent is the app; this document's own origin is opaque, so the
    // message cannot name a target origin more narrowly than '*'.
    window.parent.postMessage({ type: READY_MESSAGE }, '*')
  })
}
