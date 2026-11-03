// `@tauri-apps/plugin-opener`: external links open in a new tab; revealing a file in a file
// manager is something only the machine that holds the files can do.
import { currentHost, refusalError } from './host'

export async function openUrl(url: string | URL): Promise<void> {
  currentHost().openExternal(String(url))
}

export async function openPath(_path: string): Promise<void> {
  throw refusalError(
    currentHost().refuse('opener.openPath', 'Opening a file with the system opener', 'the file is on the workspace host, not this computer'),
  )
}

export async function revealItemInDir(_path: string | string[]): Promise<void> {
  throw refusalError(
    currentHost().refuse('opener.revealItemInDir', 'Showing a file in the file manager', 'the files are on the workspace host, not this computer'),
  )
}
