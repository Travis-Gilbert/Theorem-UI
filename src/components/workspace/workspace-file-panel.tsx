// SOURCING: dockview-react (the file's dock panel and its placement), the
// handler registry (plan D13: the file is shown by the Panel of the handler
// that opens it, or of the one picked in "Open with"), useIndexQuery
// (react-query: a Markdown file's properties, which handlers may match on);
// ui/button; LinksPane beside the file.
import type { DockviewApi, IDockviewPanelProps } from 'dockview-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { OpenWith } from '@/components/handlers/open-with'
import { Icon } from '@/components/icons'
import { openBeside } from '@/components/shell/open-beside'
import { Button } from '@/components/ui/button'
import { useSaveState } from '@/lib/handlers/file-sync'
import type { SaveState } from '@/lib/handlers/file-sync'
import {
  handlerFor,
  matchInput,
  mimeOf,
  useHandlerRegistry,
} from '@/lib/handlers/registry'
import {
  entryOf,
  sameFile,
  useWorkspaceFileView,
  workspaceFilePanelId,
} from '@/lib/workspace/open'
import type { WorkspaceFileRef } from '@/lib/workspace/open'
import type { WorkspaceClient, WorkspaceEvent } from '@/lib/workspace/types'
import {
  useIndexQuery,
  useWorkspaceClient,
  useWorkspaceTree,
  useWorkspaces,
} from '@/lib/workspace/workspaces'
import { cn } from '@/lib/utils'
import { LinksPane, useLinksAside } from './links-pane'

/** The dock's component name for workspace files. */
export const WORKSPACE_FILE_COMPONENT = 'workspaceFile'

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const within = (path: string, folder: string) =>
  path === folder || path.startsWith(`${folder}/`)

/**
 * A Markdown file's frontmatter properties, from the workspace index, for
 * handlers that match on them; null for other files.
 */
const useMatchProperties = (client: WorkspaceClient, path: string) =>
  useIndexQuery(client, ['properties', path], () => client.properties(path), {
    enabled: mimeOf(path) === 'text/markdown',
  })

function Message({ children }: { children: React.ReactNode }) {
  return <p className="p-6 text-sm text-ink-muted">{children}</p>
}

function Header({
  path,
  onClose,
  children,
}: {
  path: string
  onClose?: () => void
  /** Controls before Close. */
  children?: React.ReactNode
}) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-separator px-4">
      <Icon.TreeFile className="size-4 shrink-0 text-ink-faint" />
      <h2 className="min-w-0 flex-1 truncate text-sm font-medium" title={path}>
        {basename(path)}
      </h2>
      {children}
      {onClose && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close"
          onClick={onClose}
        >
          <Icon.Close />
        </Button>
      )}
    </header>
  )
}

/** Where a save went, said the way the navigator names the place. */
function SaveNote({
  client,
  state,
}: {
  client: WorkspaceClient
  state: SaveState | null
}) {
  if (!state) return null
  const place = client.theorem ? 'to Home' : 'on this device'
  return (
    <span
      role="status"
      className={cn(
        'shrink-0 text-xs text-ink-faint',
        state === 'stopped' && 'text-error-ink',
      )}
    >
      {state === 'saving'
        ? 'Saving…'
        : state === 'saved'
          ? `Saved ${place}`
          : 'Not saved'}
    </span>
  )
}

function FileView({
  client,
  file,
  onMoved,
  onClose,
}: {
  client: WorkspaceClient
  file: WorkspaceFileRef
  onMoved: (file: WorkspaceFileRef) => void
  onClose?: () => void
}) {
  const tree = useWorkspaceTree(client)
  // The file is its entry, wherever the tree now has it.
  const entry = entryOf(tree.data, file)
  const path = entry?.path ?? file.path
  const properties = useMatchProperties(client, path)
  const handlers = useHandlerRegistry((s) => s.handlers)
  const [deleted, setDeleted] = useState(false)
  const links = useLinksAside()
  const saveState = useSaveState(client, entry)

  const found = entry && { entryId: entry.id, path: entry.path }
  const reportMove = useEffectEvent(() => {
    if (found && (found.entryId !== file.entryId || found.path !== file.path))
      onMoved({ ...file, ...found })
  })
  const { entryId: foundId, path: foundPath } = found ?? {}
  useEffect(() => reportMove(), [foundId, foundPath, file.entryId, file.path])

  const onEvent = useEffectEvent((event: WorkspaceEvent) => {
    switch (event.type) {
      case 'changed':
      case 'created':
        if (event.entry.path === path) setDeleted(false)
        return
      case 'deleted':
        if (within(path, event.path)) setDeleted(true)
        return
      case 'resync':
        setDeleted(false)
    }
  })
  useEffect(() => client.subscribe((event) => onEvent(event)), [client])

  const matched =
    entry &&
    !properties.isLoading &&
    handlerFor(matchInput(entry, properties.data ?? null), handlers)
  const handler =
    (file.handler && handlers.find((h) => h.id === file.handler)) || matched

  let body: React.ReactNode
  if (deleted) body = <Message>This file was deleted.</Message>
  else if (tree.isPending || properties.isLoading)
    body = <Message>Loading…</Message>
  else if (!entry) body = <Message>This file is not in this folder.</Message>
  else if (!handler) body = <Message>Nothing here can show this file.</Message>
  else
    body = (
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <handler.Panel
            // Another file or another view is a new view; a move is not.
            key={`${handler.id}:${entry.id}`}
            client={client}
            path={path}
            entry={entry}
          />
        </div>
        {links.open && <LinksPane client={client} path={path} entry={entry} />}
      </div>
    )

  return (
    <>
      <Header path={path} onClose={onClose}>
        {!deleted && <SaveNote client={client} state={saveState} />}
        {entry && handler && !deleted && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Links"
            aria-pressed={links.open}
            title="Backlinks, links and tags"
            className="aria-pressed:bg-pill"
            onClick={links.toggle}
          >
            <Icon.Link />
          </Button>
        )}
        {entry && handler && !deleted && (
          <OpenWith
            file={{ client, path, entry }}
            properties={properties.data}
            current={handler.id}
            render={
              <Button variant="ghost" size="icon-xs" aria-label="Open with" />
            }
          >
            <Icon.More />
          </OpenWith>
        )}
      </Header>
      {body}
    </>
  )
}

/** A file from a folder workspace, for the dock panel and the phone overlay. */
export function WorkspaceFilePanel({
  file,
  onMoved,
  onClose,
  className,
}: {
  file: WorkspaceFileRef
  /** The file was found at another path, or by its path took on its entry. */
  onMoved: (file: WorkspaceFileRef) => void
  onClose?: () => void
  className?: string
}) {
  const client = useWorkspaceClient(file.workspaceId)
  const { isPending } = useWorkspaces()

  return (
    <div className={cn('flex h-full flex-col bg-artifact', className)}>
      {client ? (
        <FileView
          key={file.entryId || file.path}
          client={client}
          file={file}
          onMoved={onMoved}
          onClose={onClose}
        />
      ) : (
        <>
          <Header path={file.path} onClose={onClose} />
          <Message>
            {isPending ? 'Loading…' : 'This folder is not open.'}
          </Message>
        </>
      )}
    </div>
  )
}

/**
 * A workspace file in the dock. The panel holds the file's entry, so a rename
 * or move only changes where the panel says the file is.
 */
export function WorkspaceFileDockPanel({
  api,
  params,
}: IDockviewPanelProps<WorkspaceFileRef>) {
  const onMoved = (next: WorkspaceFileRef) => {
    api.updateParameters(next)
    api.setTitle(basename(next.path))
  }
  return <WorkspaceFilePanel file={params} onMoved={onMoved} />
}

/** The dock's open workspace file panels. */
const filePanels = (api: DockviewApi) =>
  api.panels.filter(
    (panel) => panel.view.contentComponent === WORKSPACE_FILE_COMPONENT,
  )

const refOf = (panel: { params?: unknown }) =>
  panel.params as WorkspaceFileRef | undefined

/**
 * Opens a file in the dock: it joins the open workspace file tabs, else opens
 * beside `besidePanelId` (the conversation) when that sits in the grid. A file
 * already open comes forward, switched to `file.handler` when one is given.
 * A file `replacing` an open one opens in its place, and that panel closes.
 */
export function openWorkspaceFilePanel(
  api: DockviewApi,
  file: WorkspaceFileRef,
  besidePanelId: string,
  replacing?: string,
) {
  const panels = filePanels(api)
  const existing = panels.find((panel) => {
    const ref = refOf(panel)
    return ref !== undefined && sameFile(ref, file)
  })
  const old =
    replacing === undefined
      ? undefined
      : panels.find((panel) => {
          const ref = refOf(panel)
          return (
            panel !== existing &&
            ref?.workspaceId === file.workspaceId &&
            ref.path === replacing
          )
        })
  if (existing) {
    const ref = refOf(existing)!
    const next = { ...ref, ...file, entryId: file.entryId || ref.entryId }
    if (
      next.path !== ref.path ||
      (file.handler && file.handler !== ref.handler)
    ) {
      existing.api.updateParameters(next)
      existing.api.setTitle(basename(next.path))
    }
    existing.api.setActive()
    old?.api.close()
    return
  }
  // A panel opened by path may hold the id of a file that has since moved.
  const id = api.getPanel(workspaceFilePanelId(file))
    ? `${workspaceFilePanelId(file)}:${crypto.randomUUID()}`
    : workspaceFilePanelId(file)
  const options = {
    id,
    component: WORKSPACE_FILE_COMPONENT,
    params: file,
    title: basename(file.path),
    minimumWidth: 360,
  }
  if (old) {
    api.addPanel({
      ...options,
      position: { referencePanel: old.id, direction: 'within' },
    })
    old.api.close()
    return
  }
  const sibling = panels[0]
  if (sibling) {
    api.addPanel({ ...options, position: { referenceGroup: sibling.group } })
    return
  }
  openBeside(api, options, besidePanelId, 0.4)
}

/** The open workspace file over the conversation, on a phone. */
export function WorkspaceFileOverlay() {
  const file = useWorkspaceFileView((s) => s.file)
  const close = useWorkspaceFileView((s) => s.close)
  if (!file) return null
  return (
    <WorkspaceFilePanel
      file={file}
      onMoved={(next) => useWorkspaceFileView.setState({ file: next })}
      onClose={close}
      className="fixed inset-0 z-40"
    />
  )
}
