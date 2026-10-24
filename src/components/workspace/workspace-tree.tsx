// SOURCING: @headless-tree/react + @headless-tree/core (tree state, keyboard
// navigation, selection, the tree ARIA roles, renaming on F2, and dragging
// entries or Finder's files onto a folder), rows styled like the sidebar's
// chat list; Base UI ContextMenu (the right-click menu, as the chat list has
// one); entries from useWorkspaceTree (react-query, live); new notes and
// folders from lib/workspace/notes.ts; zustand (a new entry waiting to be
// named, and what last failed, so the folder's own menu can ask too). In the
// Theorem vault, entries Theorem holds as documents or plans take their own
// marks (entry-mark.tsx) and the menu adds what only Theorem can do.
import { ContextMenu } from '@base-ui/react/context-menu'
import {
  dragAndDropFeature,
  hotkeysCoreFeature,
  renamingFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from '@headless-tree/core'
import type { ItemInstance } from '@headless-tree/core'
import { useTree } from '@headless-tree/react'
import { basename, extname, join } from 'pathe'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { Icon } from '@/components/icons'
import { menuItem, menuPopup } from '@/components/shell/sidebar'
import { writeNewFile } from '@/lib/handlers/file-sync'
import { hostActions } from '@/lib/handlers/actions'
import { WorkspaceRequestError } from '@/lib/workspace/desktop-client'
import { newFolder, newNote } from '@/lib/workspace/notes'
import { openWorkspaceFile } from '@/lib/workspace/open'
import {
  exportOkfBundle,
  importOkfBundle,
  isDismissed,
  promoteEntry,
} from '@/lib/workspace/theorem-actions'
import type {
  TheoremSource,
  WorkspaceClient,
  WorkspaceEntry,
  WorkspaceId,
} from '@/lib/workspace/types'
import { useWorkspaceTree } from '@/lib/workspace/workspaces'
import { cn } from '@/lib/utils'
import { theoremMark } from './entry-mark'

const ROOT = 'root'
const INDENT = 12

interface TreeNode {
  name: string
  path: string
  folder: boolean
  children: Array<string>
  theorem?: TheoremSource
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

const isNote = (node: TreeNode) => !node.folder && extname(node.path) === '.md'

/** The folder a path is in, '' for the top of the workspace. */
const parentOf = (path: string) =>
  path.slice(0, Math.max(path.lastIndexOf('/'), 0))

const isTaken = (error: unknown) =>
  error instanceof WorkspaceRequestError && error.status === 409

/**
 * Items are keyed by entry id, which survives a rename, so a moved folder
 * stays expanded. Folders sort before files, then by name as Finder does.
 */
function buildNodes(entries: Array<WorkspaceEntry>) {
  const nodes = new Map<string, TreeNode>([
    [ROOT, { name: '', path: '', folder: true, children: [] }],
  ])
  const ids = new Map<string, string>()
  for (const entry of entries) {
    ids.set(entry.path, entry.id)
    nodes.set(entry.id, {
      name: entry.path.slice(entry.path.lastIndexOf('/') + 1),
      path: entry.path,
      folder: entry.kind === 'directory',
      children: [],
      theorem: entry.theorem,
    })
  }
  for (const entry of entries) {
    const slash = entry.path.lastIndexOf('/')
    const parent = slash === -1 ? ROOT : ids.get(entry.path.slice(0, slash))
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
  return { nodes, ids }
}

interface Naming {
  workspaceId: WorkspaceId
  path: string
  /** A note opens once it is named. */
  open: boolean
}

const useTreeRequests = create<{
  naming: Naming | null
  problems: Partial<Record<WorkspaceId, string>>
}>()(() => ({ naming: null, problems: {} }))

const report = (workspaceId: WorkspaceId, problem: string | undefined) =>
  useTreeRequests.setState((s) => ({
    problems: { ...s.problems, [workspaceId]: problem },
  }))

/** Runs a change to the folder; a failure is said under its tree. */
export async function attempt(
  workspaceId: WorkspaceId,
  change: () => Promise<unknown>,
  failure: (error: unknown) => string,
) {
  report(workspaceId, undefined)
  try {
    await change()
  } catch (error) {
    // Closing a file dialog is not a failure.
    if (!isDismissed(error)) report(workspaceId, failure(error))
  }
}

/** Saves the notes under `folder` as an OKF bundle; failures under the tree. */
export const exportOkf = (client: WorkspaceClient, folder: string) =>
  attempt(
    client.workspace.id,
    () => exportOkfBundle(client, folder),
    () => 'The OKF bundle could not be made.',
  )

/** Imports an OKF bundle the person picks into `folder`. */
export const importOkf = (client: WorkspaceClient, folder: string) =>
  attempt(
    client.workspace.id,
    () => importOkfBundle(client, folder),
    () => 'The OKF bundle could not be imported.',
  )

/**
 * Makes a note or a folder in `folder` and names it in place in the tree, as
 * VS Code does. A note opens once it has its name.
 */
export const makeEntry = (
  client: WorkspaceClient,
  folder: string,
  kind: 'note' | 'folder',
) =>
  attempt(
    client.workspace.id,
    async () => {
      const path = await (kind === 'note' ? newNote : newFolder)(client, folder)
      useTreeRequests.setState({
        naming: {
          workspaceId: client.workspace.id,
          path,
          open: kind === 'note',
        },
      })
    },
    () => `A new ${kind} could not be made.`,
  )

/** One workspace's files, kept current as they change on disk. */
export function WorkspaceTree({ client }: { client: WorkspaceClient }) {
  const { data: entries, isPending, isError } = useWorkspaceTree(client)
  const { nodes, ids } = useMemo(() => buildNodes(entries ?? []), [entries])
  const workspaceId = client.workspace.id
  const naming = useTreeRequests((s) =>
    s.naming?.workspaceId === workspaceId ? s.naming : null,
  )
  const problem = useTreeRequests((s) => s.problems[workspaceId])
  const [menu, setMenu] = useState({ open: false, target: ROOT })
  // The new note being named, by item id; it opens once its name settles.
  const opening = useRef<string | null>(null)

  const settle = (id: string, path: string) => {
    if (opening.current !== id) return
    opening.current = null
    openWorkspaceFile({ workspaceId, path })
  }

  const rename = async (item: ItemInstance<TreeNode>, value: string) => {
    const node = item.getItemData()
    const name = value.trim()
    const next =
      isNote(node) && !name.toLowerCase().endsWith('.md') ? `${name}.md` : name
    const to = join(parentOf(node.path), next)
    let path = node.path
    if (!name || name.includes('/'))
      report(workspaceId, 'A name cannot be empty or have a “/” in it.')
    else if (to !== node.path)
      await attempt(
        workspaceId,
        async () => {
          await client.rename(node.path, to)
          path = to
        },
        (error) =>
          isTaken(error)
            ? `There is already a “${next}” here.`
            : `“${node.name}” could not be renamed.`,
      )
    settle(item.getId(), path)
  }

  const move = async (items: Array<ItemInstance<TreeNode>>, folder: string) => {
    for (const { path } of items.map((item) => item.getItemData())) {
      if (parentOf(path) === folder) continue
      const name = basename(path)
      await attempt(
        workspaceId,
        () => client.rename(path, join(folder, name)),
        (error) =>
          isTaken(error)
            ? `There is already a “${name}” in ${folder ? `“${basename(folder)}”` : 'the top folder'}.`
            : `“${name}” could not be moved.`,
      )
    }
  }

  const copyIn = async (files: Array<File>, folder: string) => {
    for (const file of files)
      await attempt(
        workspaceId,
        async () =>
          writeNewFile(
            client,
            folder,
            file.name,
            new Uint8Array(await file.arrayBuffer()),
          ),
        () => `“${file.name}” could not be copied in.`,
      )
  }

  const trash = async (items: Array<ItemInstance<TreeNode>>) => {
    for (const { name, path } of items.map((item) => item.getItemData()))
      await attempt(
        workspaceId,
        () => client.remove(path),
        () =>
          client.theorem
            ? `“${name}” could not be removed.`
            : `“${name}” could not be moved to the Trash.`,
      )
  }

  const tree = useTree<TreeNode>({
    rootItemId: ROOT,
    // What a rename starts from: a note's name without `.md`, as Obsidian has it.
    getItemName: (item) => {
      const node = item.getItemData()
      return isNote(node) ? basename(node.path, '.md') : node.name
    },
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
    onRename: (item, value) => void rename(item, value),
    hotkeys: {
      // Escape as the feature has it, and a new note still opens.
      abortRenaming: {
        hotkey: 'Escape',
        allowWhenInputFocused: true,
        isEnabled: (instance) => instance.isRenamingItem(),
        handler: (_, instance) => {
          const item = instance.getRenamingItem()
          instance.abortRenaming()
          if (item) settle(item.getId(), item.getItemData().path)
        },
      },
    },
    // A drop lands in a folder, or in the folder of the file it is on.
    canReorder: false,
    canDrop: (items, target) => {
      const into = target.item.getItemData()
      return (
        into.folder &&
        items.every((item) => {
          const { path } = item.getItemData()
          return into.path !== path && !into.path.startsWith(`${path}/`)
        })
      )
    },
    onDrop: (items, target) => move(items, target.item.getItemData().path),
    // Over a file, Finder's files go next to it, in its folder.
    canDragForeignDragObjectOver: (dataTransfer) =>
      dataTransfer.types.includes('Files'),
    canDropForeignDragObject: (dataTransfer, target) =>
      dataTransfer.files.length > 0 && target.item.getItemData().folder,
    onDropForeignDragObject: (dataTransfer, target) =>
      copyIn([...dataTransfer.files], target.item.getItemData().path),
    indent: INDENT,
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      renamingFeature,
      dragAndDropFeature,
    ],
  })

  // Before paint, so a change never shows the previous structure.
  useLayoutEffect(() => tree.rebuildTree(), [tree, nodes])

  // A new note or folder is named as soon as the tree has it.
  useLayoutEffect(() => {
    const id = naming && ids.get(naming.path)
    if (!naming || !id) return
    useTreeRequests.setState({ naming: null })
    const item = tree.getItemInstance(id)
    if (naming.open) opening.current = id
    item.setFocused()
    item.startRenaming()
  }, [tree, ids, naming])

  if (isPending)
    return <p className="px-3.5 py-1 text-sm text-ink-faint-sheet">Loading…</p>
  if (isError)
    return (
      <p className="px-3.5 py-1 text-sm text-ink-faint-sheet">
        This folder could not be read.
      </p>
    )

  const target = nodes.get(menu.target) ?? nodes.get(ROOT)!
  const targetItem =
    menu.target === ROOT ? null : tree.getItemInstance(menu.target)
  // Trashing a selected entry trashes the whole selection, as Finder does.
  // Theorem keeps plans; they are not the vault's to remove.
  const doomed = (
    targetItem?.isSelected()
      ? tree.getSelectedItems()
      : targetItem
        ? [targetItem]
        : []
  ).filter((item) => item.getItemData().theorem?.backing !== 'plan')
  // In the Theorem vault a document is archived, and anything else deleted.
  const archives = doomed.every(
    (item) => item.getItemData().theorem?.backing === 'document',
  )
  const removeLabel = !client.theorem
    ? doomed.length > 1
      ? `Move ${doomed.length} items to the Trash`
      : 'Move to Trash'
    : `${archives ? 'Archive' : 'Delete'}${doomed.length > 1 ? ` ${doomed.length} items` : ''}`
  const folderPath = target.folder ? target.path : parentOf(target.path)
  const host = hostActions({ client, path: target.path })
  // The folder a drop would land in: the target, or the folder of a file.
  const over = tree.getDragTarget()?.item
  const dropInto = (over?.isFolder() ? over : over?.getParent())?.getId()
  const makeIn = (kind: 'note' | 'folder') => {
    if (targetItem?.isFolder()) targetItem.expand()
    void makeEntry(
      client,
      target.folder ? target.path : parentOf(target.path),
      kind,
    )
  }

  return (
    <>
      <ContextMenu.Root
        onOpenChange={(open) => setMenu((m) => ({ ...m, open }))}
      >
        <ContextMenu.Trigger
          {...tree.getContainerProps(client.workspace.name)}
          // Rows name themselves the target as the event bubbles up to here.
          onContextMenuCapture={() => setMenu((m) => ({ ...m, target: ROOT }))}
          data-drop-target={dropInto === ROOT || undefined}
          className="flex min-h-7 flex-col gap-px rounded-md outline-none data-drop-target:bg-hover"
        >
          {nodes.get(ROOT)?.children.length ? (
            tree.getItems().map((item) => {
              const node = item.getItemData()
              const expanded = item.isExpanded()
              const source = theoremMark(node.theorem)
              const Mark = node.folder
                ? expanded
                  ? Icon.FolderOpen
                  : Icon.Folder
                : (source?.Mark ?? Icon.TreeFile)
              const marks = (
                <>
                  <Icon.Next
                    aria-hidden="true"
                    className={cn(
                      'size-2.5 shrink-0 text-ink-faint transition-transform duration-150',
                      expanded && 'rotate-90',
                      !node.folder && 'invisible',
                    )}
                  />
                  <Mark
                    className="size-4 shrink-0 text-ink-faint"
                    strokeWidth={1.75}
                  />
                </>
              )
              const shared = {
                ...item.getProps(),
                style: {
                  paddingInlineStart: 8 + item.getItemMeta().level * INDENT,
                },
                onContextMenu: () =>
                  setMenu((m) => ({ ...m, target: item.getId() })),
                'data-active': item.isSelected() || undefined,
                'data-drop-target': dropInto === item.getId() || undefined,
                'data-menu-target':
                  (menu.open && menu.target === item.getId()) || undefined,
                className:
                  'flex h-7 w-full items-center gap-1.5 rounded-md pe-2 text-start text-sm transition-colors duration-100 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus data-active:bg-pill data-active:shadow-pill data-menu-target:bg-hover data-drop-target:bg-hover data-drop-target:outline-1 data-drop-target:-outline-offset-1 data-drop-target:outline-focus',
              }
              if (item.isRenaming())
                return (
                  <div key={item.getId()} {...shared}>
                    {marks}
                    <input
                      {...item.getRenameInputProps()}
                      aria-label={`Rename ${node.name}`}
                      spellCheck={false}
                      // A name is kept when the field loses focus, as in Finder.
                      onBlur={() =>
                        tree.isRenamingItem() && tree.completeRenaming()
                      }
                      onClick={(event) => event.stopPropagation()}
                      className="h-5.5 min-w-0 flex-1 rounded-sm bg-background px-1 text-sm outline-1 outline-focus"
                    />
                  </div>
                )
              return (
                <button
                  key={item.getId()}
                  {...shared}
                  type="button"
                  title={source?.label}
                >
                  {marks}
                  <span className="min-w-0 truncate">{node.name}</span>
                </button>
              )
            })
          ) : (
            <p className="px-1.5 py-1 text-sm text-ink-faint-sheet">
              This folder is empty.
            </p>
          )}
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner className="z-50">
            {/* Focus stays put on close, so a rename's field keeps it. */}
            <ContextMenu.Popup
              finalFocus={false}
              className={`min-w-44 ${menuPopup}`}
            >
              <ContextMenu.Item
                className={menuItem}
                onClick={() => makeIn('note')}
              >
                <Icon.Add className="size-4" />
                New note
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItem}
                onClick={() => makeIn('folder')}
              >
                <Icon.Folder className="size-4" />
                New folder
              </ContextMenu.Item>
              {client.theorem && target.folder && (
                <>
                  <ContextMenu.Separator className="my-1 h-px bg-separator" />
                  <ContextMenu.Item
                    className={menuItem}
                    onClick={() => void importOkf(client, folderPath)}
                  >
                    <Icon.Add className="size-4" />
                    Import OKF bundle…
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={menuItem}
                    onClick={() => void exportOkf(client, folderPath)}
                  >
                    <Icon.Share className="size-4" />
                    Export as OKF bundle…
                  </ContextMenu.Item>
                </>
              )}
              {(targetItem || host) && (
                <ContextMenu.Separator className="my-1 h-px bg-separator" />
              )}
              {client.theorem && target.theorem?.agent && (
                <ContextMenu.Item
                  className={menuItem}
                  onClick={() =>
                    void attempt(
                      workspaceId,
                      () => promoteEntry(client, target.path),
                      () => `“${target.name}” could not be made yours.`,
                    )
                  }
                >
                  <Icon.Article className="size-4" />
                  Make it mine
                </ContextMenu.Item>
              )}
              {targetItem && (
                <ContextMenu.Item
                  className={menuItem}
                  onClick={() => targetItem.startRenaming()}
                >
                  <Icon.Edit className="size-4" />
                  Rename
                </ContextMenu.Item>
              )}
              {host && (
                <ContextMenu.Item
                  className={menuItem}
                  onClick={host.revealInFinder}
                >
                  <Icon.FolderOpen className="size-4" />
                  Reveal in Finder
                </ContextMenu.Item>
              )}
              {doomed.length > 0 && (
                <ContextMenu.Item
                  className={cn(
                    menuItem,
                    'text-error-ink data-highlighted:bg-error-container',
                  )}
                  onClick={() => void trash(doomed)}
                >
                  {archives && client.theorem ? (
                    <Icon.Archive className="size-4" />
                  ) : (
                    <Icon.Delete className="size-4" strokeWidth={1.75} />
                  )}
                  {removeLabel}
                </ContextMenu.Item>
              )}
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {problem && (
        <p role="alert" className="px-1.5 pt-1 text-xs text-error-ink">
          {problem}
        </p>
      )}
    </>
  )
}
