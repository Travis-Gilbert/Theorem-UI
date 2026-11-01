// `@tauri-apps/plugin-opener`: external links open in a new tab; revealing a file in a file
// manager is something only the machine that holds the files can do.
import { currentHost } from './host'

export async function openUrl(url: string | URL): Promise<void> {
  currentHost().openExternal(String(url))
}

export async function openPath(_path: string): Promise<void> {
  throw new Error('Opening a path with the system opener is not available from a browser tab')
}

export async function revealItemInDir(_path: string | string[]): Promise<void> {
  throw new Error('Showing a file in the file manager is not available: the files are on the workspace host')
}
