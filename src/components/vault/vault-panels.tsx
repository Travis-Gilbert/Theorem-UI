// SOURCING: the shell's FoldersSection (WorkspaceTree over @headless-tree/react)
// for Files, and the workspace commands (new note, today's note, quick
// switcher) on the empty tab, or useOpenFolder and the sign-in link when there
// is nothing to open. Outline, Links and Graph are the inspector's panels.
import { Icon } from '@/components/icons'
import { Button, buttonVariants } from '@/components/ui/button'
import { FoldersSection } from '@/components/workspace/folders'
import { openQuickSwitcher } from '@/components/workspace/quick-switcher'
import { attempt } from '@/components/workspace/workspace-tree'
import { newNote, openTodaysNote } from '@/lib/workspace/notes'
import { signInHref, useSignInConfigured } from '@/lib/theorem/sign-in'
import { openWorkspaceFile } from '@/lib/workspace/open'
import type { WorkspaceClient } from '@/lib/workspace/types'
import {
  useOpenFolder,
  useWorkspaceClient,
  useWorkspaces,
  workspaceClient,
} from '@/lib/workspace/workspaces'
import { useVaultFile } from './vault-state'

/** The folder new notes go in: the followed file's, else the first open one. */
export function useVaultClient(): WorkspaceClient | undefined {
  const file = useVaultFile((s) => s.file)
  const followed = useWorkspaceClient(file?.workspaceId ?? '')
  const first = useWorkspaces().workspaces[0]
  return followed ?? (first && workspaceClient(first))
}

/** Makes a note at the folder's root and opens it. */
export const createNote = (client: WorkspaceClient) =>
  attempt(
    client.workspace.id,
    async () =>
      openWorkspaceFile({
        workspaceId: client.workspace.id,
        path: await newNote(client, ''),
      }),
    () => 'The note could not be made.',
  )

export const openToday = (client: WorkspaceClient) =>
  attempt(
    client.workspace.id,
    () => openTodaysNote(client),
    () => 'Today’s note could not be opened.',
  )

export function FilesPanel() {
  return (
    <div className="on-sheet flex h-full flex-col">
      <FoldersSection fill />
    </div>
  )
}

/**
 * Without a folder or a vault: on the desktop, open a folder; on the web, sign
 * in, which brings the Theorem vault.
 */
function NoFiles() {
  const { isPending } = useWorkspaces()
  const openFolder = useOpenFolder()
  const signIn = useSignInConfigured()
  if (isPending) return <p className="text-sm text-ink-muted">Loading…</p>
  if (openFolder)
    return (
      <>
        <p className="text-sm text-ink-muted">Open a folder to start.</p>
        <Button
          variant="ghost"
          size="sm"
          disabled={openFolder.isPending}
          onClick={() => openFolder.mutate()}
        >
          <Icon.OpenFolder className="size-4" />
          Open folder
        </Button>
      </>
    )
  if (signIn)
    return (
      <>
        <p className="text-sm text-ink-muted">
          Sign in to keep your notes in Theorem.
        </p>
        <a href={signInHref()} className={buttonVariants({ size: 'sm' })}>
          Sign in
        </a>
      </>
    )
  return (
    <p className="text-sm text-ink-muted">
      This Theorem does not keep files yet.
    </p>
  )
}

/** The editor's place while no file is open. */
export function StartPanel() {
  const client = useVaultClient()
  const actions = [
    {
      label: 'New note',
      Mark: Icon.Add,
      run: client && (() => void createNote(client)),
    },
    {
      label: 'Today’s note',
      Mark: Icon.Article,
      run: client && (() => void openToday(client)),
    },
    { label: 'Open a file', Mark: Icon.Search, run: openQuickSwitcher },
  ]
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <Icon.Notes className="size-8 text-ink-faint" />
      {client ? (
        <p className="text-sm text-ink-muted">No file is open.</p>
      ) : (
        <NoFiles />
      )}
      {client && (
        <div className="flex flex-col items-stretch gap-1">
          {actions.map(({ label, Mark, run }) => (
            <Button
              key={label}
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={run}
            >
              <Mark className="size-4" />
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
