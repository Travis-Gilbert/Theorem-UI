// SOURCING: penpal 8 (connect + WindowMessenger: the handshake neither side can lose, origin and source-window checks, a channel per load), the same library and pattern the app uses for its IDE frame in src/components/ide/ide-frame.tsx. This file only names the methods and the failure rule.
import { connect, WindowMessenger } from 'penpal'

/** Bumped when the methods below change shape. The child reports the one it speaks. */
export const PROTOCOL = 1

/** What the embedded app offers the site. */
export type AppMethods = {
  /** Input is on. `focus` asks for the message box, and is only set by an explicit Try. */
  activate(options: { focus: boolean }): void
  /** Input is off, and the app must not take focus. It is not torn down. */
  deactivate(): void
  /** Sets the message box's draft. Never submits, and never replaces a draft the visitor already has. */
  setDraft(text: string): { applied: boolean }
}

/** What the site offers the embedded app. */
export type SiteMethods = {
  /** Session and project exist, initial state loaded, layout and fonts settled, ready for the next interaction. */
  ready(info: { protocol: number }): void
  failed(reason: string): void
  /** The visitor pressed Escape inside the frame. */
  escape(): void
}

export interface BridgeHandlers {
  onReady: () => void
  onFailed: (reason: string) => void
  onEscape: () => void
  /** The frame's document was replaced underneath the bridge (a move without moveBefore reloads it): open a new one. */
  onLost: () => void
}

export interface Bridge {
  activate: (focus: boolean) => void
  deactivate: () => void
  setDraft: (text: string) => Promise<{ applied: boolean }>
  destroy: () => void
}

/** How long the app has to answer the handshake, and then to say it is ready. Running out is a failure, never readiness. */
export const HANDSHAKE_MS = 20_000
export const READY_MS = 45_000

/** The query parameter the app reads the protocol and per-load channel from. A query, so that a retry reloads the document. */
export const EMBED_PARAM = 'site-embed'

/**
 * Starts listening, then loads the app into `iframe`, in that order, so nothing
 * the child says can be lost. Everything goes through `location.replace` so the
 * visitor's Back button never steps through the frame's loads.
 */
export function openBridge(
  iframe: HTMLIFrameElement,
  appUrl: string,
  handlers: BridgeHandlers,
): Bridge {
  const remoteWindow = iframe.contentWindow
  if (!remoteWindow) throw new Error('The frame has no window yet.')

  const load = crypto.randomUUID()
  const url = new URL(appUrl, location.href)
  url.searchParams.set(EMBED_PARAM, `${PROTOCOL}.${load}`)

  let settled = false
  let readyTimer: ReturnType<typeof setTimeout> | undefined
  const fail = (reason: string) => {
    if (settled) return
    settled = true
    clearTimeout(readyTimer)
    handlers.onFailed(reason)
  }

  const methods: SiteMethods = {
    ready({ protocol }) {
      if (settled) return
      if (protocol !== PROTOCOL) return fail(`protocol ${protocol}`)
      settled = true
      clearTimeout(readyTimer)
      handlers.onReady()
    },
    failed: fail,
    escape: handlers.onEscape,
  }

  const connection = connect<AppMethods>({
    messenger: new WindowMessenger({
      remoteWindow,
      allowedOrigins: [url.origin],
    }),
    channel: load,
    timeout: HANDSHAKE_MS,
    methods: { ...methods },
  })
  connection.promise.then(
    () => {
      readyTimer = setTimeout(() => fail('not ready in time'), READY_MS)
    },
    () => fail('no handshake'),
  )

  // The window is the frame's document. If a later load brings a different one, this channel has no one on the other end.
  const loaded = () => {
    if (iframe.contentWindow !== remoteWindow) handlers.onLost()
  }
  iframe.addEventListener('load', loaded)

  remoteWindow.location.replace(url.href)

  const ignore = () => {}
  return {
    activate(focus) {
      void connection.promise
        .then((app) => app.activate({ focus }))
        .catch(ignore)
    },
    deactivate() {
      void connection.promise.then((app) => app.deactivate()).catch(ignore)
    },
    setDraft: (text) => connection.promise.then((app) => app.setDraft(text)),
    destroy() {
      settled = true
      clearTimeout(readyTimer)
      iframe.removeEventListener('load', loaded)
      connection.destroy()
    },
  }
}
