// SOURCING: the assistant-ui TooltipIconButton (each command), dockview-react's
// layout events (which panels are showing, through useSyncExternalStore),
// react-query over the followed note's saved text (word and character counts,
// lib/vault/note-stats.ts) and the workspace index (its backlinks), the
// workspace tree (the folder's counts), and the workspace commands.
import { useQuery } from '@tanstack/react-query'
import type { DockviewApi } from 'dockview-react'
import { extname } from 'pathe'
import { useSyncExternalStore } from 'react'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import { openFolderSettings } from '@/components/workspace/folder-settings-dialog'
import { openQuickSwitcher } from '@/components/workspace/quick-switcher'
import { openSearch } from '@/components/workspace/search-dialog'
import { fileTextKey } from '@/lib/handlers/file-sync'
import { noteStats } from '@/lib/vault/note-stats'
import type { WorkspaceClient } from '@/lib/workspace/types'
import {
  useIndexQuery,
  useOpenFolder,
  useWorkspaceClient,
  useWorkspaceTree,
} from '@/lib/workspace/workspaces'
import { createNote, openToday, useVaultClient } from './vault-panels'
import { VAULT_TOOLS, useVaultFile } from './vault-state'
import type { VaultTool } from './vault-state'

const TOOL_MARKS = {
  files: Icon.Files,
  outline: Icon.Outline,
  links: Icon.Link,
  graph: Icon.Graph,
} satisfies Record<VaultTool, unknown>

const button = 'size-6 p-1 text-ink-faint hover:text-ink aria-pressed:text-ink'

/** Which tools the dock is showing, kept current with its layout. */
function useShownTools(dock: DockviewApi | undefined) {
  const shown = useSyncExternalStore(
    (onChange) => {
      const listener = dock?.onDidLayoutChange(onChange)
      return () => listener?.dispose()
    },
    () =>
      (Object.keys(VAULT_TOOLS) as Array<VaultTool>)
        .filter((id) => dock?.getPanel(id))
        .join(' '),
    () => '',
  )
  return new Set(shown.split(' '))
}

const plural = (count: number, one: string) =>
  `${count.toLocaleString()} ${one}${count === 1 ? '' : 's'}`

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-3.5 w-px bg-separator" />
}

/** The followed note's backlinks and counts. */
function NoteStatus({
  client,
  path,
  onShowLinks,
}: {
  client: WorkspaceClient
  path: string
  onShowLinks: () => void
}) {
  const stats = useQuery({
    queryKey: fileTextKey(client.workspace.id, path),
    queryFn: () => client.readText(path),
    staleTime: Infinity,
    select: ({ text }) => noteStats(text),
  })
  const backlinks = useIndexQuery(
    client,
    ['backlink-count', path],
    async () =>
      new Set((await client.backlinks(path)).map((link) => link.from)).size,
  )
  return (
    <>
      {backlinks.data !== undefined && (
        <button
          type="button"
          className="rounded px-1 hover:bg-hover hover:text-ink"
          title="Show the notes that link here"
          onClick={onShowLinks}
        >
          {plural(backlinks.data, 'backlink')}
        </button>
      )}
      {stats.data && (
        <>
          <span className="px-1">{plural(stats.data.words, 'word')}</span>
          <span className="px-1">
            {plural(stats.data.characters, 'character')}
          </span>
        </>
      )}
    </>
  )
}

/** The folder's counts and whether its code is trusted. */
function FolderStatus({ client }: { client: WorkspaceClient }) {
  const tree = useWorkspaceTree(client)
  const files = (tree.data ?? []).filter((entry) => entry.kind === 'file')
  const notes = files.filter((entry) => extname(entry.path) === '.md').length
  const { name, trusted } = client.workspace
  const Trust = trusted ? Icon.Trusted : Icon.Untrusted
  return (
    <>
      <span className="px-1">{plural(notes, 'note')}</span>
      <span className="px-1">{plural(files.length - notes, 'attachment')}</span>
      <Divider />
      <button
        type="button"
        title={
          trusted
            ? `${name}: its code may run. Folder settings…`
            : `${name}: its code does not run. Folder settings…`
        }
        className="flex items-center gap-1 rounded px-1 hover:bg-hover hover:text-ink"
        onClick={() => openFolderSettings(client.workspace.id)}
      >
        <Trust className="size-3.5" />
        <span className="max-w-32 truncate">{name}</span>
      </button>
    </>
  )
}

/**
 * The Vault's bottom bar, as Obsidian's status bar: on the left the panels
 * and the folder commands, on the right the open note's counts and the folder's.
 */
export function VaultStatusBar({
  dock,
  onToggle,
  onReset,
}: {
  dock: DockviewApi | undefined
  onToggle: (tool: VaultTool) => void
  onReset: () => void
}) {
  const shown = useShownTools(dock)
  const client = useVaultClient()
  const openFolder = useOpenFolder()
  const file = useVaultFile((s) => s.file)
  const fileClient = useWorkspaceClient(file?.workspaceId ?? '')
  const showLinks = () => {
    const links = dock?.getPanel('links')
    if (links) links.api.setActive()
    else onToggle('links')
  }

  return (
    <footer
      aria-label="Vault status"
      className="flex h-8 shrink-0 items-center gap-0.5 border-t border-separator px-1.5 text-xs text-ink-faint tabular-nums"
    >
      {(Object.keys(VAULT_TOOLS) as Array<VaultTool>).map((tool) => {
        const Mark = TOOL_MARKS[tool]
        const open = shown.has(tool)
        return (
          <TooltipIconButton
            key={tool}
            side="top"
            tooltip={`${open ? 'Hide' : 'Show'} ${VAULT_TOOLS[tool]}`}
            aria-pressed={open}
            className={button}
            onClick={() => onToggle(tool)}
          >
            <Mark className="size-4" />
          </TooltipIconButton>
        )
      })}
      <Divider />
      <TooltipIconButton
        side="top"
        tooltip="New note"
        className={button}
        disabled={!client}
        onClick={() => client && void createNote(client)}
      >
        <Icon.Add className="size-4" />
      </TooltipIconButton>
      <TooltipIconButton
        side="top"
        tooltip="Today’s note"
        className={button}
        disabled={!client}
        onClick={() => client && void openToday(client)}
      >
        <Icon.Article className="size-4" />
      </TooltipIconButton>
      <TooltipIconButton
        side="top"
        tooltip="Open a file"
        className={button}
        onClick={openQuickSwitcher}
      >
        <Icon.Notes className="size-4" />
      </TooltipIconButton>
      <TooltipIconButton
        side="top"
        tooltip="Search"
        className={button}
        onClick={() => openSearch()}
      >
        <Icon.Search className="size-4" />
      </TooltipIconButton>
      {openFolder && (
        <TooltipIconButton
          side="top"
          tooltip="Open folder"
          className={button}
          disabled={openFolder.isPending}
          onClick={() => openFolder.mutate()}
        >
          <Icon.OpenFolder className="size-4" />
        </TooltipIconButton>
      )}
      <TooltipIconButton
        side="top"
        tooltip="Reset layout"
        className={button}
        onClick={onReset}
      >
        <Icon.Layout className="size-4" />
      </TooltipIconButton>
      <div className="min-w-0 flex-1" />
      <div className="flex min-w-0 items-center overflow-hidden whitespace-nowrap">
        {file && fileClient && extname(file.path) === '.md' && (
          <>
            <NoteStatus
              client={fileClient}
              path={file.path}
              onShowLinks={showLinks}
            />
            <Divider />
          </>
        )}
        {client && <FolderStatus client={client} />}
      </div>
    </footer>
  )
}
