// SOURCING: browser-fs-access (the open and save dialogs, with their download
// and input fallbacks) over the Theorem vault's abilities on WorkspaceClient.
// The actions the tree, the vault's menu and a read-only note's bar share.
import { fileOpen, fileSave } from 'browser-fs-access'
import { openWorkspaceFile } from './open'
import type { TheoremAbilities, WorkspaceClient } from './types'

function abilities(client: WorkspaceClient): TheoremAbilities {
  if (!client.theorem) throw new Error('Only the Theorem vault can do this.')
  return client.theorem
}

/** The person closed a file dialog without choosing. */
export const isDismissed = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError'

/**
 * Makes an agent's document the person's own. The agent's note leaves the
 * vault, so the document opens in its place.
 */
export async function promoteEntry(client: WorkspaceClient, path: string) {
  const entry = await abilities(client).promote(path)
  openWorkspaceFile({ workspaceId: client.workspace.id, path: entry.path }, path)
}

/** Saves the notes under `folder` ('' for all of them) as an OKF bundle. */
export async function exportOkfBundle(client: WorkspaceClient, folder: string) {
  const bundle = await abilities(client).exportOkf(folder)
  await fileSave(
    new Blob([bundle.bytes as Uint8Array<ArrayBuffer>], {
      type: 'application/gzip',
    }),
    {
      fileName: bundle.fileName,
      extensions: ['.tar.gz'],
      description: 'OKF bundle',
    },
  )
}

/** Asks for an OKF bundle and makes its concepts documents under `folder`. */
export async function importOkfBundle(client: WorkspaceClient, folder: string) {
  const file = await fileOpen({
    extensions: ['.gz', '.tgz'],
    mimeTypes: ['application/gzip'],
    description: 'OKF bundle',
  })
  return abilities(client).importOkf(folder, {
    fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  })
}
