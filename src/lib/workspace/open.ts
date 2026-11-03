// SOURCING: zustand (which workspace file the phone overlay shows; on the
// desktop, panel placement is the dockview layout's), the same seam as
// components/notes/note-view.ts.
import { create } from 'zustand'
import type { EntryId, WorkspaceEntry, WorkspaceId } from './types'

export interface WorkspaceFileRef {
  workspaceId: WorkspaceId
  /**
   * Which file this is. It survives renames and moves, so a tab, a reference
   * or a restored layout keeps its file wherever the file goes. '' until the
   * view finds the entry at `path` (a caller that knew only the path, or a
   * layout saved before files had ids), when it takes that entry's id.
   */
  entryId: EntryId
  /** Workspace-relative POSIX path: where the file is, not which file it is. */
  path: string
  /**
   * The id of the handler to show the file with, chosen in "Open with".
   * Without one, the registry picks.
   */
  handler?: string
}

/** A file to open; its entry id may be unknown yet. */
export type WorkspaceFileTarget = Omit<WorkspaceFileRef, 'entryId'> &
  Partial<Pick<WorkspaceFileRef, 'entryId'>>

export const fileRef = (target: WorkspaceFileTarget): WorkspaceFileRef => ({
  ...target,
  entryId: target.entryId ?? '',
})

/** Whether `a` and `b` are the same file, by entry where both know it. */
export const sameFile = (a: WorkspaceFileRef, b: WorkspaceFileRef) =>
  a.workspaceId === b.workspaceId &&
  (a.entryId && b.entryId ? a.entryId === b.entryId : a.path === b.path)

/** The ref's entry in `entries`: by its id, else at its path. */
export const entryOf = (
  entries: ReadonlyArray<WorkspaceEntry> | undefined,
  { entryId, path }: WorkspaceFileRef,
) =>
  (entryId ? entries?.find((e) => e.id === entryId) : undefined) ??
  entries?.find((e) => e.path === path)

/** The Dockview panel id for a file opened from a workspace. */
export const workspaceFilePanelId = ({
  workspaceId,
  entryId,
  path,
}: WorkspaceFileRef) => `workspace-file:${workspaceId}:${entryId || path}`

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
 * one at `replacing` (another entry, perhaps at the same path) opens where
 * that one is open.
 */
export function openWorkspaceFile(
  target: WorkspaceFileTarget,
  replacing?: string,
) {
  const file = fileRef(target)
  const { vault, dock } = useWorkspaceFileView.getState()
  if (vault) vault.open(file, replacing)
  else if (dock) dock.open(file, replacing)
  else useWorkspaceFileView.setState({ file })
}
