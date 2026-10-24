// SOURCING: the shell's FoldersSection (WorkspaceTree over @headless-tree/react)
// for Files, LinksPane for Links, react-query over the file's saved text and the
// workspace's Markdown parser (parseNote) for the outline, openFileAt for the
// heading a click reveals, and the workspace commands (new note, today's note,
// quick switcher) on the empty tab.
import { useQuery } from '@tanstack/react-query'
import { extname } from 'pathe'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { FoldersSection } from '@/components/workspace/folders'
import { LinksPane } from '@/components/workspace/links-pane'
import { openQuickSwitcher } from '@/components/workspace/quick-switcher'
import { attempt } from '@/components/workspace/workspace-tree'
import { openFileAt } from '@/lib/handlers/actions'
import { fileTextKey } from '@/lib/handlers/file-sync'
import { newNote, openTodaysNote } from '@/lib/workspace/notes'
import { openWorkspaceFile } from '@/lib/workspace/open'
import type { WorkspaceClient } from '@/lib/workspace/types'
import {
  useWorkspaceClient,
  useWorkspaceEntry,
  useWorkspaces,
  workspaceClient,
} from '@/lib/workspace/workspaces'
import { parseNote } from '#/server/desktop/workspace/markdown'
import { useVaultFile } from './vault-state'

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-3 text-sm text-ink-faint">{children}</p>
}

/** The client of the file the Vault follows, with that file's path. */
function useFollowedFile() {
  const file = useVaultFile((s) => s.file)
  const client = useWorkspaceClient(file?.workspaceId ?? '')
  return file && client ? { client, path: file.path } : undefined
}

/** The folder new notes go in: the followed file's, else the first open one. */
export function useVaultClient(): WorkspaceClient | undefined {
  const followed = useFollowedFile()
  const first = useWorkspaces().workspaces[0]
  return followed?.client ?? (first && workspaceClient(first))
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
    <div className="on-sheet h-full">
      <FoldersSection className="h-full max-h-none border-t-0" />
    </div>
  )
}

function Outline({ client, path }: { client: WorkspaceClient; path: string }) {
  const headings = useQuery({
    queryKey: fileTextKey(client.workspace.id, path),
    queryFn: () => client.readText(path),
    staleTime: Infinity,
    select: ({ text }) => parseNote(text).headings,
  })
  if (extname(path) !== '.md') return <Empty>This file has no outline.</Empty>
  if (headings.isPending) return <Empty>Loading…</Empty>
  if (!headings.data?.length) return <Empty>This note has no headings.</Empty>
  // The shallowest heading sits at the left edge, as in Obsidian's outline.
  const top = Math.min(...headings.data.map((h) => h.depth))
  return (
    <nav aria-label="Outline" className="px-1.5 py-1.5">
      {headings.data.map((heading) => (
        <button
          key={`${heading.line}:${heading.text}`}
          type="button"
          style={{ paddingInlineStart: `${(heading.depth - top) * 14 + 6}px` }}
          className="flex w-full min-w-0 items-center rounded-md py-1 pe-1.5 text-start text-sm text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          onClick={() => openFileAt({ client, path }, `#${heading.text}`)}
        >
          <span className="min-w-0 truncate">{heading.text}</span>
        </button>
      ))}
    </nav>
  )
}

/** The followed note's headings; a click scrolls the note to one. */
export function OutlinePanel() {
  const followed = useFollowedFile()
  return (
    <div className="h-full overflow-y-auto">
      {followed ? (
        <Outline {...followed} />
      ) : (
        <Empty>Open a note to see its outline.</Empty>
      )}
    </div>
  )
}

function Links({ client, path }: { client: WorkspaceClient; path: string }) {
  const entry = useWorkspaceEntry(client, path).data
  if (!entry) return <Empty>Loading…</Empty>
  return (
    <LinksPane
      client={client}
      path={path}
      entry={entry}
      className="h-full w-full border-l-0"
    />
  )
}

/** Backlinks, outgoing links and tags of the followed file. */
export function LinksPanel() {
  const followed = useFollowedFile()
  return followed ? (
    <Links {...followed} />
  ) : (
    <Empty>Open a note to see what links to it.</Empty>
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
      <p className="text-sm text-ink-muted">
        {client ? 'No file is open.' : 'Open a folder to start.'}
      </p>
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
