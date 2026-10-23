// SOURCING: hand-rolled seam. The typed page side of the host bridge (plan
// D5); the transport binds json-rpc-2.0 once the relay lands.
import type { FolderGrant } from './bindings/FolderGrant'
import type { HostEvent } from './bindings/HostEvent'

/** What the desktop host offers the page. Absent on the web. */
export interface DesktopHost {
  /** The system folder picker. `null` when the person cancels. */
  pickFolder: () => Promise<FolderGrant | null>
  /** Open a file, inside a granted folder, in a native editor window. */
  openNativeEditor: (absolutePath: string) => Promise<void>
  revealInFinder: (absolutePath: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  setDocumentEdited: (edited: boolean) => Promise<void>
  notify: (title: string, body?: string) => Promise<void>
  /** Returns an unsubscribe function. */
  onEvent: (listener: (event: HostEvent) => void) => () => void
}

/** The desktop host, or `null` when the page runs in a normal browser. */
export function getDesktopHost(): DesktopHost | null {
  return null
}
