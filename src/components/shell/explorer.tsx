// SOURCING: the app's FilesystemTree (components/ui/filesystem-tree: lucide icons, framer-motion, tree roles and arrow keys), the coss sidebar's group and row (the heading is a row like a project's, its folder opening with it), @tanstack/react-query via lib/theorem/project-files (the cached root, children and content reads)
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { SidebarGroup, SidebarMenuButton } from '@/components/coss/sidebar'
import { Icon } from '@/components/icons'
import { FolderTrees } from '@/components/workspace/folders'
import { FilesystemTree } from '@/components/ui/filesystem-tree'
import type { FilesystemNode } from '@/components/ui/filesystem-tree'
import { describeError } from '@/lib/theorem/client'
import {
  fileChildrenQuery,
  isUnconfigured,
  useFileDock,
  useFileRoot,
} from '@/lib/theorem/project-files'
import type { FileEntry } from '@/lib/theorem/project-files'
import { cn } from '@/lib/utils'
import { useActiveProject } from './projects'
import { useShell } from './shell-state'

function FileTree({ projectId, root }: { projectId: string; root: FileEntry }) {
  const queryClient = useQueryClient()
  // Folders read since the tree opened, by path. A folder the server sent
  // with its children already loaded needs no read.
  const [read, setRead] = useState<Record<string, FileEntry[]>>({})
  const [loading, setLoading] = useState<ReadonlySet<string>>(new Set())
  const [failed, setFailed] = useState<Record<string, string>>({})
  const [chosen, setChosen] = useState<string>()
  const top = useQuery({
    ...fileChildrenQuery(projectId, root.path),
    enabled: !root.loaded,
  })

  const childrenOf = (entry: FileEntry) =>
    read[entry.path] ?? (entry.loaded ? entry.children : undefined)

  const toNode = (entry: FileEntry): FilesystemNode => {
    const folder = entry.kind !== 'file'
    const children = folder ? childrenOf(entry) : undefined
    return {
      id: entry.path,
      name: entry.name,
      nodes: folder ? (children ?? []).map(toNode) : undefined,
      lazy: folder && children === undefined,
      loading: loading.has(entry.path),
      disabled: entry.refusal !== null,
      title: entry.refusal ?? failed[entry.path] ?? entry.path,
    }
  }

  const readFolder = async (path: string) => {
    setLoading((held) => new Set(held).add(path))
    try {
      const entries = await queryClient.fetchQuery(
        fileChildrenQuery(projectId, path),
      )
      setRead((held) => ({ ...held, [path]: entries }))
    } catch (error) {
      setFailed((held) => ({ ...held, [path]: describeError(error) }))
    } finally {
      setLoading((held) => {
        const next = new Set(held)
        next.delete(path)
        return next
      })
    }
  }

  const entries = root.loaded ? root.children : top.data
  if (!entries)
    return top.error ? (
      <p className="px-3 py-2 text-sm text-error-ink">
        {describeError(top.error)}
      </p>
    ) : (
      <p className="px-3 py-2 text-sm text-ink-faint">Reading files…</p>
    )
  if (!entries.length)
    return <p className="px-3 py-2 text-sm text-ink-faint">No files yet.</p>
  return (
    <FilesystemTree
      label="Project files"
      nodes={entries.map(toNode)}
      animated
      selectedId={chosen}
      onSelect={(node) => {
        if (!node.id) return
        setChosen(node.id)
        useFileDock.getState().open?.(node.id)
      }}
      onOpenChange={(node, open) => {
        if (open && node.lazy && node.id && !loading.has(node.id))
          void readFolder(node.id)
      }}
      className="flex flex-col px-1 py-1"
    />
  )
}

/** The root's state: the tree once it reads, else why it does not. */
function ExplorerBody({ projectId }: { projectId: string }) {
  const root = useFileRoot(projectId)
  if (root.isPending)
    return <p className="px-3 py-2 text-sm text-ink-faint">Reading files…</p>
  if (root.error)
    // A server with no folder bound simply has no project tree to show.
    return isUnconfigured(root.error) ? null : (
      <p className="px-3 py-2 text-sm leading-relaxed text-error-ink">
        {describeError(root.error)}
      </p>
    )
  return (
    <FileTree key={projectId} projectId={projectId} root={root.data.root} />
  )
}

/**
 * The project's files under the chats, at the sidebar's own scale: folders
 * open in place and choosing a file opens it as a panel in the dock.
 */
export function Explorer() {
  const { project } = useActiveProject()
  const open = useShell((s) => s.explorerOpen)
  const toggle = useShell((s) => s.toggleExplorer)
  const root = useFileRoot(project?.projectId)
  const name = root.data?.root.name

  return (
    <SidebarGroup
      role="region"
      aria-label="Files"
      className={cn(
        'min-h-0 overflow-hidden border-t border-separator',
        open ? 'max-h-[50%] shrink' : 'shrink-0',
      )}
    >
      <SidebarMenuButton
        aria-expanded={open}
        onClick={toggle}
        className="shrink-0"
      >
        <Icon.Folder />
        <span className="min-w-0 flex-1 truncate">
          Files
          {name && <span className="text-ink-muted"> · {name}</span>}
        </span>
      </SidebarMenuButton>
      {open && (
        <div className="min-h-0 flex-1 overflow-auto">
          {project && <ExplorerBody projectId={project.projectId} />}
          <FolderTrees />
        </div>
      )}
    </SidebarGroup>
  )
}
