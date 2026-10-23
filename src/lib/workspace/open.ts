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

/** The desktop dock, which hosts each open workspace file as its own panel. */
export type WorkspaceFileDock = { open: (file: WorkspaceFileRef) => void }

type WorkspaceFileView = {
  /** The file the phone overlay shows; the dock tracks its own panels. */
  file: WorkspaceFileRef | undefined
  /** Set while the desktop dock is mounted. */
  dock: WorkspaceFileDock | undefined
  close: () => void
}

export const useWorkspaceFileView = create<WorkspaceFileView>()((set) => ({
  file: undefined,
  dock: undefined,
  close: () => set({ file: undefined }),
}))

/** Opens a workspace file in the dock, or over the conversation on a phone. */
export function openWorkspaceFile(file: WorkspaceFileRef) {
  const { dock } = useWorkspaceFileView.getState()
  if (dock) dock.open(file)
  else useWorkspaceFileView.setState({ file })
}
