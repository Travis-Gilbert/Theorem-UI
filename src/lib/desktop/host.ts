// SOURCING: json-rpc-2.0's JSONRPCClient over fetch for the calls and the
// browser's EventSource for the events, against the local server's relay
// (src/server/desktop/rpc.ts, events.ts); TanStack Start's createIsomorphicFn
// reads the desktop flag on either side.
import { createIsomorphicFn } from '@tanstack/react-start'
import { JSONRPCClient } from 'json-rpc-2.0'
import { isDesktopMode } from '#/server/desktop/mode'
import type { FolderGrant } from './bindings/FolderGrant'
import type { HostCall } from './bindings/HostCall'
import type { HostEvent } from './bindings/HostEvent'

/** What the desktop host offers the page. Absent on the web. */
export interface DesktopHost {
  /** The system folder picker. `null` when the person cancels. */
  pickFolder: () => Promise<FolderGrant | null>
  /** Open a file, inside a granted folder, in a native editor window. */
  openNativeEditor: (absolutePath: string) => Promise<void>
  revealInFinder: (absolutePath: string) => Promise<void>
  /**
   * Open a file, inside a granted folder, with the app the system uses for
   * its type. The host refuses folders and files it would run instead.
   */
  openWithDefault: (absolutePath: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  setDocumentEdited: (edited: boolean) => Promise<void>
  notify: (title: string, body?: string) => Promise<void>
  /**
   * Returns an unsubscribe function. The first event a listener sees is
   * `grantsChanged` with the current grants.
   */
  onEvent: (listener: (event: HostEvent) => void) => () => void
}

/**
 * Set on `<html>` by the root document when the desktop host started the
 * server. It arrives in the server-rendered HTML, before any script runs, so
 * the first client render already knows where it is: no flash of web UI in
 * the app, and none of desktop UI on the web.
 */
export const DESKTOP_DOCUMENT_ATTRIBUTE = 'data-theorem-desktop'

/** True when the page belongs to the desktop app, on the server or in the browser. */
export const isDesktopDocument = createIsomorphicFn()
  .server(isDesktopMode)
  .client(hasDesktopDocumentFlag)

/** The browser side of `isDesktopDocument`. */
export function hasDesktopDocumentFlag(): boolean {
  return document.documentElement.hasAttribute(DESKTOP_DOCUMENT_ATTRIBUTE)
}

let host: DesktopHost | undefined

/**
 * The desktop host, or `null` when the page runs in a normal browser. During
 * server rendering it only says whether the host exists; call its methods from
 * the browser.
 */
export function getDesktopHost(): DesktopHost | null {
  if (!isDesktopDocument()) return null
  return (host ??= createDesktopHost())
}

const RPC_PATH = '/desktop/host/rpc'
const EVENTS_PATH = '/desktop/host/events'

type ParamsOf<TMethod extends HostCall['method']> = Extract<
  HostCall,
  { method: TMethod }
>['params']

function createDesktopHost(): DesktopHost {
  // json-rpc-2.0's documented fetch transport.
  const client: JSONRPCClient = new JSONRPCClient(async (request) => {
    const response = await fetch(RPC_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (response.status === 200) client.receive(await response.json())
    else if (request.id !== undefined) {
      throw new Error(`The desktop bridge answered ${response.status}`)
    }
  })
  const call = <TMethod extends HostCall['method']>(
    method: TMethod,
    params: ParamsOf<TMethod>,
  ): Promise<unknown> => Promise.resolve(client.request(method, params))
  const done = () => undefined

  return {
    // The host answers pickFolder with a FolderGrant or null (HostCall's docs).
    pickFolder: () => call('pickFolder', {}) as Promise<FolderGrant | null>,
    openNativeEditor: (path) => call('openNativeEditor', { path }).then(done),
    revealInFinder: (path) => call('revealInFinder', { path }).then(done),
    openWithDefault: (path) => call('openWithDefault', { path }).then(done),
    openExternal: (url) => call('openExternal', { url }).then(done),
    setDocumentEdited: (edited) =>
      call('setDocumentEdited', { edited }).then(done),
    notify: (title, body) =>
      call('notify', { title, body: body ?? null }).then(done),
    onEvent: subscribe,
  }
}

const listeners = new Set<(event: HostEvent) => void>()
let events: EventSource | undefined
let latestGrants: HostEvent | undefined

/**
 * One EventSource serves every listener, opened with the first and closed
 * with the last. The stream opens with the grants, so a listener that joins
 * later gets the latest grants replayed.
 */
function subscribe(listener: (event: HostEvent) => void): () => void {
  listeners.add(listener)
  if (events) {
    const grants = latestGrants
    if (grants)
      queueMicrotask(() => listeners.has(listener) && listener(grants))
  } else {
    events = new EventSource(EVENTS_PATH)
    events.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as HostEvent
      if (event.type === 'grantsChanged') latestGrants = event
      for (const each of listeners) each(event)
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      events?.close()
      events = undefined
      latestGrants = undefined
    }
  }
}
