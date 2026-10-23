// SOURCING: dockview-react (the file's dock panel and its placement),
// @tanstack/react-query (the file's bytes, refetched on its events), the
// platform TextDecoder; ui/button. A plain text view: the note editor is bound
// to Theorem Documents (editNote, the note cache), not to files.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { DockviewApi, IDockviewPanelProps } from 'dockview-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { Icon } from '@/components/icons'
import { openBeside } from '@/components/shell/open-beside'
import { Button } from '@/components/ui/button'
import {
  openWorkspaceFile,
  useWorkspaceFileView,
  workspaceFilePanelId,
} from '@/lib/workspace/open'
import type { WorkspaceFileRef } from '@/lib/workspace/open'
import type { WorkspaceClient, WorkspaceEvent } from '@/lib/workspace/types'
import { useWorkspaceClient, useWorkspaces } from '@/lib/workspace/workspaces'
import { cn } from '@/lib/utils'

/** The dock's component name for workspace files. */
export const WORKSPACE_FILE_COMPONENT = 'workspaceFile'

/** Above this the file is not shown as text. */
const TEXT_LIMIT = 2 * 1024 * 1024

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const within = (path: string, folder: string) =>
  path === folder || path.startsWith(`${folder}/`)

type Contents =
  | { kind: 'text'; text: string; hash: string }
  | { kind: 'binary' | 'large'; hash: string }

async function readContents(
  client: WorkspaceClient,
  path: string,
): Promise<Contents> {
  const { bytes, hash } = await client.read(path)
  if (bytes.length > TEXT_LIMIT) return { kind: 'large', hash }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { kind: 'text', text, hash }
  } catch {
    return { kind: 'binary', hash }
  }
}

function FileBody({
  client,
  path,
  onMoved,
}: {
  client: WorkspaceClient
  path: string
  onMoved: (path: string) => void
}) {
  const queryClient = useQueryClient()
  const queryKey = ['desktop', 'workspace', client.workspace.id, 'file', path]
  const contents = useQuery({
    queryKey,
    queryFn: () => readContents(client, path),
    staleTime: Infinity,
    retry: false,
  })
  const [deleted, setDeleted] = useState(false)

  const onEvent = useEffectEvent((event: WorkspaceEvent) => {
    switch (event.type) {
      case 'changed':
      case 'created':
        if (event.entry.path !== path) return
        setDeleted(false)
        void queryClient.invalidateQueries({ queryKey })
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
        void queryClient.invalidateQueries({ queryKey })
    }
  })
  useEffect(() => client.subscribe((event) => onEvent(event)), [client])

  if (deleted)
    return <p className="p-6 text-sm text-ink-muted">This file was deleted.</p>
  if (contents.isPending)
    return <p className="p-6 text-sm text-ink-muted">Loading…</p>
  if (contents.isError)
    return (
      <p className="p-6 text-sm text-ink-muted">This file is unavailable.</p>
    )
  if (contents.data.kind !== 'text')
    return (
      <p className="p-6 text-sm text-ink-muted">
        {contents.data.kind === 'large'
          ? 'This file is too large to show as text.'
          : 'This file is not text.'}
      </p>
    )
  return (
    <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap">
      {contents.data.text}
    </pre>
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
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-separator px-4">
        <Icon.TreeFile className="size-4 shrink-0 text-ink-faint" />
        <h2
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={file.path}
        >
          {basename(file.path)}
        </h2>
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
      {client ? (
        <FileBody
          key={file.path}
          client={client}
          path={file.path}
          onMoved={onMoved}
        />
      ) : (
        <p className="p-6 text-sm text-ink-muted">
          {isPending ? 'Loading…' : 'This folder is not open.'}
        </p>
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
    const next = { workspaceId: params.workspaceId, path }
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
 * beside `besidePanelId` (the conversation) when that sits in the grid.
 */
export function openWorkspaceFilePanel(
  api: DockviewApi,
  file: WorkspaceFileRef,
  besidePanelId: string,
) {
  const id = workspaceFilePanelId(file)
  const existing = api.getPanel(id)
  if (existing) {
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
      onMoved={(path) => openWorkspaceFile({ ...file, path })}
      onClose={close}
      className="fixed inset-0 z-40"
    />
  )
}
