// SOURCING: @headless-tree/react + @headless-tree/core (tree state, keyboard
// navigation, selection and the tree ARIA roles), rows styled like the
// sidebar's chat list; entries from useWorkspaceTree (react-query, live)
import {
  hotkeysCoreFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from '@headless-tree/core'
import { useTree } from '@headless-tree/react'
import { useLayoutEffect, useMemo } from 'react'
import { Icon } from '@/components/icons'
import { openWorkspaceFile } from '@/lib/workspace/open'
import type { WorkspaceClient, WorkspaceEntry } from '@/lib/workspace/types'
import { useWorkspaceTree } from '@/lib/workspace/workspaces'
import { cn } from '@/lib/utils'

const ROOT = 'root'
const INDENT = 12

interface TreeNode {
  name: string
  path: string
  folder: boolean
  children: Array<string>
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

/**
 * Items are keyed by entry id, which survives a rename, so a moved folder
 * stays expanded. Folders sort before files, then by name as Finder does.
 */
function buildNodes(entries: Array<WorkspaceEntry>) {
  const nodes = new Map<string, TreeNode>([
    [ROOT, { name: '', path: '', folder: true, children: [] }],
  ])
  const idOfPath = new Map<string, string>()
  for (const entry of entries) {
    idOfPath.set(entry.path, entry.id)
    nodes.set(entry.id, {
      name: entry.path.slice(entry.path.lastIndexOf('/') + 1),
      path: entry.path,
      folder: entry.kind === 'directory',
      children: [],
    })
  }
  for (const entry of entries) {
    const slash = entry.path.lastIndexOf('/')
    const parent =
      slash === -1 ? ROOT : idOfPath.get(entry.path.slice(0, slash))
    if (parent) nodes.get(parent)?.children.push(entry.id)
  }
  for (const node of nodes.values())
    node.children.sort((a, b) => {
      const x = nodes.get(a)!
      const y = nodes.get(b)!
      return (
        Number(y.folder) - Number(x.folder) || collator.compare(x.name, y.name)
      )
    })
  return nodes
}

/** One workspace's files, kept current as they change on disk. */
export function WorkspaceTree({ client }: { client: WorkspaceClient }) {
  const { data: entries, isPending, isError } = useWorkspaceTree(client)
  const nodes = useMemo(() => buildNodes(entries ?? []), [entries])
  const workspaceId = client.workspace.id

  const tree = useTree<TreeNode>({
    rootItemId: ROOT,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().folder,
    dataLoader: {
      // An item the tree still remembers after it was deleted reads as empty.
      getItem: (id) =>
        nodes.get(id) ?? { name: '', path: '', folder: false, children: [] },
      getChildren: (id) => nodes.get(id)?.children ?? [],
    },
    onPrimaryAction: (item) => {
      const { folder, path } = item.getItemData()
      if (!folder) openWorkspaceFile({ workspaceId, path })
    },
    indent: INDENT,
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  })

  // Before paint, so a change never shows the previous structure.
  useLayoutEffect(() => tree.rebuildTree(), [tree, nodes])

  if (isPending)
    return <p className="px-3.5 py-1 text-sm text-ink-faint-sheet">Loading…</p>
  if (isError)
    return (
      <p className="px-3.5 py-1 text-sm text-ink-faint-sheet">
        This folder could not be read.
      </p>
    )
  if (!nodes.get(ROOT)?.children.length)
    return (
      <p className="px-3.5 py-1 text-sm text-ink-faint-sheet">
        This folder is empty.
      </p>
    )

  return (
    <div
      {...tree.getContainerProps(client.workspace.name)}
      className="flex flex-col gap-px outline-none"
    >
      {tree.getItems().map((item) => {
        const { folder } = item.getItemData()
        const expanded = item.isExpanded()
        const Mark = folder
          ? expanded
            ? Icon.FolderOpen
            : Icon.Folder
          : Icon.TreeFile
        return (
          <button
            {...item.getProps()}
            key={item.getId()}
            type="button"
            data-active={item.isSelected() || undefined}
            style={{
              paddingInlineStart: 8 + item.getItemMeta().level * INDENT,
            }}
            className="flex h-7 w-full items-center gap-1.5 rounded-md pe-2 text-start text-sm transition-colors duration-100 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus data-active:bg-pill data-active:shadow-pill"
          >
            <Icon.Next
              aria-hidden="true"
              className={cn(
                'size-2.5 shrink-0 text-ink-faint transition-transform duration-150',
                expanded && 'rotate-90',
                !folder && 'invisible',
              )}
            />
            <Mark className="size-4 shrink-0 text-ink-faint" />
            <span className="min-w-0 truncate">{item.getItemName()}</span>
          </button>
        )
      })}
    </div>
  )
}
