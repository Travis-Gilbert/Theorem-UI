// SOURCING: the desktop host bridge (Finder, the system's default apps, the
// native editor), pathe for the absolute path, and zustand for reveal
// requests. FileViewProps carries no heading or block, so a link to
// `note#Heading` opens the note and then asks the view that has it to scroll
// there; the request waits in the store until a view takes it.
import { join } from 'pathe'
import { create } from 'zustand'
import { getDesktopHost } from '@/lib/desktop/host'
import { openWorkspaceFile } from '@/lib/workspace/open'
import type { WorkspaceClient } from '@/lib/workspace/types'

type File = { client: WorkspaceClient; path: string }

/** The file's absolute path on this machine, for the host. */
export const absolutePath = ({ client, path }: File) =>
  join(client.workspace.path, path)

/**
 * What the desktop host can do with a file; null on the web, and for the
 * Theorem vault, which is not a folder on this machine.
 */
export function hostActions(file: File) {
  const host = getDesktopHost()
  if (!host || file.client.theorem) return null
  const at = absolutePath(file)
  return {
    revealInFinder: () => host.revealInFinder(at),
    openWithDefault: () => host.openWithDefault(at),
    openInNativeEditor: () => host.openNativeEditor(at),
  }
}

type RevealRequest = {
  workspaceId: string
  path: string
  /** `#Heading` or `#^block`. */
  subpath: string
}

export const useRevealRequest = create<{ request: RevealRequest | null }>(
  () => ({ request: null }),
)

/** Opens a file in its handler, scrolled to `subpath` when there is one. */
export function openFileAt(file: File, subpath?: string) {
  const workspaceId = file.client.workspace.id
  openWorkspaceFile({ workspaceId, path: file.path })
  if (subpath)
    useRevealRequest.setState({
      request: { workspaceId, path: file.path, subpath },
    })
}

/** The view of `file` has shown the request's part of it. */
export const revealDone = () => useRevealRequest.setState({ request: null })
