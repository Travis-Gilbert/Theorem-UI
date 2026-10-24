// SOURCING: zustand (which workspace file the phone overlay shows; on the
// desktop, panel placement is the dockview layout's), the same seam as
// components/notes/note-view.ts.
import { create } from 'zustand'
import type { WorkspaceId } from './types'

export interface WorkspaceFileRef {
  workspaceId: WorkspaceId
  /** Workspace-relative POSIX path. */
  path: string
  /**
   * The id of the handler to show the file with, chosen in "Open with".
   * Without one, the registry picks.
   */
  handler?: string
}

/** The Dockview panel id for a file opened from a workspace. */
export const workspaceFilePanelId = ({ workspaceId, path }: WorkspaceFileRef) =>
  `workspace-file:${workspaceId}:${path}`

/**
 * The desktop dock, which hosts each open workspace file as its own panel.
 * A file `replacing` another path opens in that path's panel, which closes.
 */
export type WorkspaceFileDock = {
  open: (file: WorkspaceFileRef, replacing?: string) => void
}

type WorkspaceFileView = {
  /** The file the phone overlay shows; the dock tracks its own panels. */
  file: WorkspaceFileRef | undefined
  /** Set while the desktop dock is mounted. */
  dock: WorkspaceFileDock | undefined
  /** Set while the Vault is showing; it takes files before the dock. */
  vault: WorkspaceFileDock | undefined
  close: () => void
}

export const useWorkspaceFileView = create<WorkspaceFileView>()((set) => ({
  file: undefined,
  dock: undefined,
  vault: undefined,
  close: () => set({ file: undefined }),
}))

/**
 * Opens a workspace file in the Vault when it is showing, else in the dock,
 * else over the conversation on a phone. A file that took the place of the
 * one at `replacing` opens where that one is open.
 */
export function openWorkspaceFile(file: WorkspaceFileRef, replacing?: string) {
  const { vault, dock } = useWorkspaceFileView.getState()
  const from = replacing === file.path ? undefined : replacing
  if (vault) vault.open(file, from)
  else if (dock) dock.open(file, from)
  else useWorkspaceFileView.setState({ file })
}
