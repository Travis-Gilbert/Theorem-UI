// SOURCING: dockview-react (the file's dock panel and its placement), the
// handler registry (plan D13: the file is shown by the Panel of the handler
// that opens it, or of the one picked in "Open with"), @tanstack/react-query
// (a Markdown file's properties, which handlers may match on); ui/button.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { DockviewApi, IDockviewPanelProps } from 'dockview-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { OpenWith } from '@/components/handlers/open-with'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  handlerFor,
  matchInput,
  mimeOf,
  useHandlerRegistry,
} from '@/lib/handlers/registry'
import {
  openWorkspaceFile,
  useWorkspaceFileView,
  workspaceFilePanelId,
} from '@/lib/workspace/open'
import type { WorkspaceFileRef } from '@/lib/workspace/open'
import type { WorkspaceClient, WorkspaceEvent } from '@/lib/workspace/types'
import {
  useWorkspaceClient,
  useWorkspaceTree,
  useWorkspaces,
} from '@/lib/workspace/workspaces'
import { cn } from '@/lib/utils'

/** The dock's component name for workspace files. */
export const WORKSPACE_FILE_COMPONENT = 'workspaceFile'

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const within = (path: string, folder: string) =>
  path === folder || path.startsWith(`${folder}/`)

/**
 * A Markdown file's frontmatter properties, from the workspace index, for
 * handlers that match on them; null for other files.
 */
function useMatchProperties(client: WorkspaceClient, path: string) {
  const queryClient = useQueryClient()
  const markdown = mimeOf(path) === 'text/markdown'
  const queryKey = [
    'desktop',
    'workspace',
    client.workspace.id,
    'file',
    path,
    'properties',
  ]
  const onEvent = useEffectEvent((event: WorkspaceEvent) => {
    // The index has the file's new properties once it has caught up.
    if (event.type === 'indexed' || event.type === 'resync')
      void queryClient.invalidateQueries({ queryKey })
  })
  useEffect(() => client.subscribe((event) => onEvent(event)), [client])
  return useQuery({
    queryKey,
    queryFn: () => client.properties(path),
    enabled: markdown,
    staleTime: Infinity,
    retry: false,
  })
}

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

function FileView({
  client,
  file,
  onMoved,
  onClose,
}: {
  client: WorkspaceClient
  file: WorkspaceFileRef
  onMoved: (path: string) => void
  onClose?: () => void
}) {
  const { path } = file
  const tree = useWorkspaceTree(client)
  const entry = tree.data?.find((e) => e.path === path)
  const properties = useMatchProperties(client, path)
  const handlers = useHandlerRegistry((s) => s.handlers)
  const [deleted, setDeleted] = useState(false)

  const onEvent = useEffectEvent((event: WorkspaceEvent) => {
    switch (event.type) {
      case 'changed':
      case 'created':
        if (event.entry.path === path) setDeleted(false)
        return
      case 'renamed':
        if (within(path, event.from))
          onMoved(event.to + path.slice(event.from.length))
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
      <div className="min-h-0 flex-1">
        <handler.Panel
          // Another file or another view is a new view.
          key={`${handler.id}:${path}`}
          client={client}
          path={path}
          entry={entry}
        />
      </div>
    )

  return (
    <>
      <Header path={path} onClose={onClose}>
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
  /** The file was renamed or moved, to `path`. */
  onMoved: (path: string) => void
  onClose?: () => void
  className?: string
}) {
  const client = useWorkspaceClient(file.workspaceId)
  const { isPending } = useWorkspaces()

  return (
    <div className={cn('flex h-full flex-col bg-artifact', className)}>
      {client ? (
        <FileView
          key={file.path}
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
 * A workspace file in the dock. The panel id names the path, so a rename
 * replaces the panel with one for the new path, in the same group.
 */
export function WorkspaceFileDockPanel({
  api,
  containerApi,
  params,
}: IDockviewPanelProps<WorkspaceFileRef>) {
  const onMoved = (path: string) => {
    const next = { ...params, path }
    if (!containerApi.getPanel(workspaceFilePanelId(next)))
      containerApi.addPanel({
        id: workspaceFilePanelId(next),
        component: WORKSPACE_FILE_COMPONENT,
        params: next,
        title: basename(path),
        position: { referencePanel: api.id, direction: 'within' },
      })
    api.close()
  }
  return <WorkspaceFilePanel file={params} onMoved={onMoved} />
}

/**
 * Opens a file in the dock: it joins the open workspace file tabs, else opens
 * beside `besidePanelId` (the conversation) when that sits in the grid. A file
 * already open comes forward, switched to `file.handler` when one is given.
 */
export function openWorkspaceFilePanel(
  api: DockviewApi,
  file: WorkspaceFileRef,
  besidePanelId: string,
) {
  const id = workspaceFilePanelId(file)
  const existing = api.getPanel(id)
  if (existing) {
    if (file.handler) existing.api.updateParameters(file)
    existing.api.setActive()
    return
  }
  const options = {
    id,
    component: WORKSPACE_FILE_COMPONENT,
    params: file,
    title: basename(file.path),
    minimumWidth: 360,
  }
  const sibling = api.panels.find(
    (panel) => panel.view.contentComponent === WORKSPACE_FILE_COMPONENT,
  )
  if (sibling) {
    api.addPanel({ ...options, position: { referenceGroup: sibling.group } })
    return
  }
  const initialWidth = Math.round(api.width * 0.4)
  if (api.getPanel(besidePanelId)?.api.location.type === 'grid')
    api.addPanel({
      ...options,
      initialWidth,
      position: { referencePanel: besidePanelId, direction: 'right' },
    })
  else
    api.addPanel({ ...options, initialWidth, position: { direction: 'right' } })
}

/** The open workspace file over the conversation, on a phone. */
export function WorkspaceFileOverlay() {
  const file = useWorkspaceFileView((s) => s.file)
  const close = useWorkspaceFileView((s) => s.close)
  if (!file) return null
  return (
    <WorkspaceFilePanel
      file={file}
      onMoved={(path) => openWorkspaceFile({ ...file, path })}
      onClose={close}
      className="fixed inset-0 z-40"
    />
  )
}
