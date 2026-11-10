// SOURCING: @headless-tree/react + @headless-tree/core (tree state with its async data loader, keyboard navigation, selection, the tree ARIA roles and renaming on F2), each entry drawn by the filesystem-item component as the notes tree draws its own (workspace-tree.tsx), Base UI ContextMenu (the right-click menu), coss ui AlertDialog (asking before a delete), pathe (paths), and the docked frame's file methods over the frame link (follow.ts), which reach the workspace through Theia's own FileService
//
// The IDE page's file tree. Theia shows its editors alone on this page
// (EMBEDDED_LAYOUT), so its files are here, in the sidebar: a click opens a
// file in Theia's preview editor and a double click keeps it open. Listing,
// making, renaming and deleting go through the frame, so Theia's editors
// follow a rename and its explorer state stays the same; the frame reports
// every change to the files, by the person, the agent or anyone else.
import { ContextMenu } from '@base-ui/react/context-menu'
import {
  asyncDataLoaderFeature,
  expandAllFeature,
  hotkeysCoreFeature,
  renamingFeature,
  selectionFeature,
} from '@headless-tree/core'
import type { AsyncDataLoaderDataRef, ItemInstance } from '@headless-tree/core'
import { useTree } from '@headless-tree/react'
import { basename, join } from 'pathe'
import { useEffect, useImperativeHandle, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/coss/alert-dialog'
import { Icon } from '@/components/icons'
import { menuItem, menuPopup } from '@/components/shell/sidebar'
import { Button } from '@/components/ui/button'
import {
  FilesystemItem,
  FilesystemMarks,
} from '@/components/ui/filesystem-item'
import { cn } from '@/lib/utils'
import type { IdeFileEntry } from '../../../ide/theia-extensions/theorem-workspace/src/common/ide-bridge'
import { useFollow } from './follow'
import { useIdePage } from './ide-page'

type Ide = NonNullable<ReturnType<typeof useFollow.getState>['ide']>

/** The tree's root item; every other id is a workspace path, which never starts with a slash. */
const ROOT = '/'
const INDENT = 16

const pathOf = (id: string) => (id === ROOT ? '' : id)
const idOf = (path: string) => path || ROOT
/** The folder a path is in, '' for the top of the workspace. */
const parentOf = (path: string) =>
  path.slice(0, Math.max(path.lastIndexOf('/'), 0))

/** The frame once it links; the tree waits for it rather than listing nothing. */
function linkedIde(): Promise<Ide> {
  const now = useFollow.getState().ide
  if (now) return Promise.resolve(now)
  return new Promise((resolve) => {
    const stop = useFollow.subscribe(({ ide }) => {
      if (!ide) return
      stop()
      resolve(ide)
    })
  })
}

const failure = (error: unknown) =>
  error instanceof Error ? error.message.replace(/\.$/, '') : String(error)

/** Folders whose last read failed, and why the latest one did. */
interface Unread {
  folders: ReadonlyArray<string>
  reason: string
}

/** A file or folder waiting for its name, in `folder`. */
interface Draft {
  folder: string
  kind: 'file' | 'folder'
}

/** What the section's own buttons ask of the tree. */
export interface IdeFileTreeHandle {
  create: (kind: Draft['kind']) => void
  collapseAll: () => void
}

/**
 * The workspace's files. `workspaceId` names the files a reveal opens; key
 * the tree by it, so another project's files start from a fresh tree.
 */
export function IdeFileTree({
  workspaceId,
  handle,
}: {
  workspaceId: string
  handle?: Ref<IdeFileTreeHandle>
}) {
  const [draft, setDraft] = useState<Draft>()
  const [doomed, setDoomed] = useState<Array<IdeFileEntry>>()
  const [problem, setProblem] = useState<string>()
  const [unread, setUnread] = useState<Unread>()
  const [menuTarget, setMenuTarget] = useState(ROOT)
  const [menuOpen, setMenuOpen] = useState(false)

  const attempt = async (run: (ide: Ide) => Promise<unknown>, what: string) => {
    setProblem(undefined)
    try {
      await run(await linkedIde())
    } catch (error) {
      setProblem(`${what}: ${failure(error)}.`)
    }
  }

  const reveal = (path: string, preview: boolean) =>
    void useFollow
      .getState()
      .ide?.reveal(
        { resource: { kind: 'file', workspaceId, path } },
        { preview },
      )

  const tree = useTree<IdeFileEntry>({
    rootItemId: ROOT,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().folder,
    createLoadingItemData: () => ({ name: '', path: '', folder: false }),
    dataLoader: {
      // Every item but the root arrives with its folder's listing.
      getItem: (id) => ({ name: basename(id), path: pathOf(id), folder: true }),
      // A failed read still answers, with nothing: a thrown one would leave the
      // folder loading for good. The tree keeps that empty list, so the folder
      // is remembered until a read of it succeeds; Try again asks for one.
      getChildrenWithData: async (id) => {
        const ide = await linkedIde()
        try {
          const entries = await ide.listFiles(pathOf(id))
          setUnread((now) => {
            if (!now?.folders.includes(id)) return now
            const folders = now.folders.filter((other) => other !== id)
            return folders.length ? { ...now, folders } : undefined
          })
          return entries.map((entry) => ({ id: idOf(entry.path), data: entry }))
        } catch (error) {
          setUnread((now) => ({
            folders: now?.folders.includes(id)
              ? now.folders
              : [...(now?.folders ?? []), id],
            reason: failure(error),
          }))
          return []
        }
      },
    },
    onPrimaryAction: (item) => {
      const { folder, path } = item.getItemData()
      if (!folder) reveal(path, true)
    },
    onRename: (item, value) => {
      const { name, path } = item.getItemData()
      const next = value.trim()
      if (!next || next === name) return
      if (next.includes('/')) {
        setProblem('A name cannot have a “/” in it.')
        return
      }
      void attempt(
        (ide) => ide.moveFile(path, join(parentOf(path), next)),
        `“${name}” could not be renamed`,
      )
    },
    indent: INDENT,
    features: [
      asyncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      renamingFeature,
      expandAllFeature,
    ],
  })

  // The frame reports changed folders; those the tree has read read again, keeping their rows meanwhile,
  // including one under a collapsed folder, which would otherwise show its old list once reopened.
  // After missed changes, every folder the tree has read reads again.
  useEffect(
    () =>
      useIdePage.subscribe(({ changedFolders, changedEverywhere }, previous) => {
        if (changedFolders === previous.changedFolders) return
        const read = Object.keys(
          tree.getDataRef<AsyncDataLoaderDataRef>().current.childrenIds,
        )
        const folders = changedEverywhere
          ? read
          : changedFolders
              .map(idOf)
              .filter((id) => id === ROOT || read.includes(id))
        for (const id of folders)
          void tree.getItemInstance(id).invalidateChildrenIds(true)
      }),
    [tree],
  )

  /** The folder a new entry goes in: the menu's target, or the folder of the focused file. */
  const folderFor = (id: string) => {
    if (id === ROOT) return ''
    const node = tree.getItemInstance(id).getItemData()
    return node.folder ? node.path : parentOf(node.path)
  }

  const startDraft = (kind: Draft['kind'], from: string) => {
    const folder = folderFor(from)
    if (folder) tree.getItemInstance(idOf(folder)).expand()
    setDraft({ folder, kind })
  }

  useImperativeHandle(handle, () => ({
    create: (kind) => {
      // An empty tree has no focused item, whatever the library's type says.
      const focused = tree.getFocusedItem() as
        | ItemInstance<IdeFileEntry>
        | undefined
      startDraft(kind, focused?.getId() ?? ROOT)
    },
    collapseAll: () => tree.collapseAll(),
  }))

  const finishDraft = (name: string) => {
    const current = draft
    setDraft(undefined)
    const next = name.trim()
    if (!current || !next) return
    if (next.includes('/') && current.kind === 'folder') {
      setProblem('A folder name cannot have a “/” in it.')
      return
    }
    const path = join(current.folder, next)
    void attempt(
      (ide) => ide.createFile(path, current.kind === 'folder'),
      `“${next}” could not be created`,
    )
  }

  const draftRow = (level: number) => (
    <div
      className="flex h-7 w-full shrink-0 items-center gap-1.5 rounded-md pe-2"
      style={{ paddingInlineStart: 8 + level * INDENT }}
    >
      <FilesystemMarks folder={draft?.kind === 'folder'} open={false} empty />
      <input
        autoFocus
        aria-label={draft?.kind === 'folder' ? 'New folder name' : 'New file name'}
        placeholder={draft?.kind === 'folder' ? 'Folder name' : 'File name'}
        spellCheck={false}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finishDraft(event.currentTarget.value)
          if (event.key === 'Escape') setDraft(undefined)
        }}
        onBlur={(event) => finishDraft(event.currentTarget.value)}
        className="h-6 min-w-0 flex-1 rounded-sm bg-background px-1 text-sm outline-1 outline-focus"
      />
    </div>
  )

  const entry = (item: ItemInstance<IdeFileEntry>, level: number): ReactNode => {
    const node = item.getItemData()
    const expanded = item.isExpanded()
    const marks = (
      <FilesystemMarks folder={node.folder} open={expanded} empty={false} />
    )
    const shared = {
      ...item.getProps(),
      style: { paddingInlineStart: 8 + level * INDENT },
      onContextMenu: () => setMenuTarget(item.getId()),
      'data-active': item.isSelected() || undefined,
      'data-menu-target': (menuOpen && menuTarget === item.getId()) || undefined,
      className:
        'flex h-7 w-full shrink-0 items-center gap-1.5 rounded-md pe-2 text-start text-sm transition-colors duration-100 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus data-active:bg-pill data-active:shadow-pill data-menu-target:bg-hover',
    }
    const row = item.isRenaming() ? (
      <div {...shared}>
        {marks}
        <input
          {...item.getRenameInputProps()}
          aria-label={`Rename ${node.name}`}
          spellCheck={false}
          // The name comes up selected up to its extension, so typing replaces it.
          onFocus={(event) => {
            const dot = node.folder ? -1 : node.name.lastIndexOf('.')
            event.currentTarget.setSelectionRange(
              0,
              dot > 0 ? dot : node.name.length,
            )
          }}
          onBlur={() => tree.isRenamingItem() && tree.completeRenaming()}
          onClick={(event) => event.stopPropagation()}
          className="h-6 min-w-0 flex-1 rounded-sm bg-background px-1 text-sm outline-1 outline-focus"
        />
      </div>
    ) : (
      <button
        {...shared}
        type="button"
        title={node.path}
        onDoubleClick={() => !node.folder && reveal(node.path, false)}
      >
        {marks}
        <span className="min-w-0 truncate">{node.name}</span>
      </button>
    )
    const drafting = draft && node.folder && draft.folder === node.path
    return (
      <FilesystemItem key={item.getId()} row={row} open={expanded}>
        {expanded && drafting && draftRow(level + 1)}
        {expanded && item.getChildren().map((child) => entry(child, level + 1))}
      </FilesystemItem>
    )
  }

  const root = tree.getRootItem()
  const top = root.getChildren()
  // The root is never drawn, so its own data never loads: its listing is what says the folder was read.
  const listed =
    tree.getDataRef<AsyncDataLoaderDataRef>().current.childrenIds[ROOT] !==
    undefined
  const target =
    menuTarget === ROOT ? undefined : tree.getItemInstance(menuTarget)
  // Deleting a selected entry deletes the whole selection.
  const toDelete = target?.isSelected() ? tree.getSelectedItems() : target ? [target] : []

  return (
    <>
      <ContextMenu.Root onOpenChange={setMenuOpen}>
        <ContextMenu.Trigger
          {...tree.getContainerProps('Files')}
          onContextMenuCapture={() => setMenuTarget(ROOT)}
          className="flex min-h-8 flex-col outline-none"
        >
          {draft?.folder === '' && draftRow(0)}
          {top.map((item) => entry(item, 0))}
          {top.length === 0 && !draft && !unread?.folders.includes(ROOT) && (
            <p className="px-2 py-1 text-sm text-ink-muted">
              {root.isLoading() || !listed
                ? 'Opening the workspace…'
                : 'No files yet.'}
            </p>
          )}
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner className="z-50">
            <ContextMenu.Popup
              finalFocus={false}
              className={cn('min-w-44', menuPopup)}
            >
              <ContextMenu.Item
                className={menuItem}
                onClick={() => startDraft('file', menuTarget)}
              >
                <Icon.Add className="size-4" />
                New file
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItem}
                onClick={() => startDraft('folder', menuTarget)}
              >
                <Icon.TreeFolder className="size-4" />
                New folder
              </ContextMenu.Item>
              {target && (
                <>
                  <ContextMenu.Separator className="my-1 h-px bg-separator" />
                  <ContextMenu.Item
                    className={menuItem}
                    onClick={() => target.startRenaming()}
                  >
                    <Icon.Edit className="size-4" />
                    Rename
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={cn(
                      menuItem,
                      'text-error-ink data-highlighted:bg-error-container',
                    )}
                    onClick={() =>
                      setDoomed(toDelete.map((item) => item.getItemData()))
                    }
                  >
                    <Icon.Delete className="size-4" strokeWidth={1.75} />
                    {toDelete.length > 1 ? `Delete ${toDelete.length} items` : 'Delete'}
                  </ContextMenu.Item>
                </>
              )}
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {unread && (
        <div
          role="alert"
          className="flex items-start gap-1 px-2 pt-1 text-xs text-error-ink"
        >
          <p className="min-w-0 flex-1">
            {unread.folders.length > 1
              ? `${unread.folders.length} folders`
              : unread.folders[0] === ROOT
                ? 'The workspace'
                : `“${basename(unread.folders[0] ?? '')}”`}{' '}
            could not be read: {unread.reason}.
          </p>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              for (const id of unread.folders)
                void tree.getItemInstance(id).invalidateChildrenIds()
            }}
          >
            Try again
          </Button>
        </div>
      )}
      {problem && (
        <p role="alert" className="px-2 pt-1 text-xs text-error-ink">
          {problem}
        </p>
      )}
      <AlertDialog
        open={doomed !== undefined}
        onOpenChange={(open) => {
          if (!open) setDoomed(undefined)
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {doomed?.length === 1
                ? `Delete “${doomed[0]?.name}”?`
                : `Delete ${doomed?.length} items?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {doomed?.some((file) => file.folder)
                ? 'Folders go with everything in them. '
                : ''}
              This removes them from the workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              Keep
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                const paths = (doomed ?? []).map((file) => file.path)
                setDoomed(undefined)
                void attempt(
                  (ide) => ide.deleteFiles(paths),
                  'The files could not be deleted',
                )
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  )
}
