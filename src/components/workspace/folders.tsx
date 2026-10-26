// SOURCING: Base UI Collapsible (each folder folds) and Menu (a folder's own
// commands, styled as the project switcher's), the assistant-ui
// TooltipIconButton (Search, Open folder), WorkspaceTree (@headless-tree/react),
// the workspace hooks (react-query over the desktop workspace routes)
import { Collapsible } from '@base-ui/react/collapsible'
import { Menu } from '@base-ui/react/menu'
import { useState } from 'react'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import { menuItem, menuPopup } from '@/components/shell/sidebar'
import { Button } from '@/components/ui/button'
import { hostActions } from '@/lib/handlers/actions'
import { cn } from '@/lib/utils'
import { openTodaysNote } from '@/lib/workspace/notes'
import type { WorkspaceSummary } from '@/lib/workspace/types'
import {
  useOpenFolder,
  useWorkspaces,
  workspaceClient,
} from '@/lib/workspace/workspaces'
import { openFolderSettings } from './folder-settings-dialog'
import { openSearch } from './search-dialog'
import {
  WorkspaceTree,
  attempt,
  exportOkf,
  importOkf,
  makeEntry,
} from './workspace-tree'

function WorkspaceSection({ workspace }: { workspace: WorkspaceSummary }) {
  const client = workspaceClient(workspace)
  const host = hostActions({ client, path: '' })
  const [open, setOpen] = useState(true)
  // A new entry is named in the tree, so the tree has to be showing.
  const make = (kind: 'note' | 'folder') => {
    setOpen(true)
    void makeEntry(client, '', kind)
  }

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="group/title relative flex items-center">
        <Collapsible.Trigger
          title={workspace.path || undefined}
          className="group/folder flex h-7 w-full items-center gap-1.5 rounded-md ps-2 pe-8 text-start text-sm font-medium transition-colors duration-100 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        >
          <Icon.Next
            aria-hidden="true"
            className="size-2.5 shrink-0 text-ink-faint transition-transform duration-150 group-data-panel-open/folder:rotate-90"
          />
          {client.theorem && (
            <Icon.TheoremVault
              aria-hidden="true"
              className="size-3.5 shrink-0 text-ink-faint"
            />
          )}
          <span className="min-w-0 truncate">{workspace.name}</span>
        </Collapsible.Trigger>
        <Menu.Root>
          <Menu.Trigger
            aria-label={`${workspace.name} actions`}
            render={
              <Button
                variant="ghost"
                size="icon"
                className="absolute end-1 size-5 rounded-sm p-0 opacity-0 group-hover/title:opacity-100 group-has-focus-visible/title:opacity-100 hover:bg-selected data-popup-open:bg-hover data-popup-open:opacity-100"
              />
            }
          >
            <Icon.More className="size-3.5" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              side="bottom"
              align="end"
              sideOffset={4}
              className="z-50"
            >
              <Menu.Popup className={`min-w-48 ${menuPopup}`}>
                <Menu.Item className={menuItem} onClick={() => make('note')}>
                  <Icon.Add className="size-4" />
                  New note
                </Menu.Item>
                <Menu.Item className={menuItem} onClick={() => make('folder')}>
                  <Icon.TreeFolder className="size-4" />
                  New folder
                </Menu.Item>
                <Menu.Item
                  className={menuItem}
                  onClick={() =>
                    void attempt(
                      workspace.id,
                      () => openTodaysNote(client),
                      () => 'Today’s note could not be opened.',
                    )
                  }
                >
                  <Icon.Article className="size-4" />
                  Today’s note
                </Menu.Item>
                <Menu.Separator className="my-1 h-px bg-separator" />
                {client.theorem && (
                  <>
                    <Menu.Item
                      className={menuItem}
                      onClick={() => void importOkf(client, '')}
                    >
                      <Icon.Add className="size-4" />
                      Import OKF bundle…
                    </Menu.Item>
                    <Menu.Item
                      className={menuItem}
                      onClick={() => void exportOkf(client, '')}
                    >
                      <Icon.Share className="size-4" />
                      Export as OKF bundle…
                    </Menu.Item>
                    <Menu.Separator className="my-1 h-px bg-separator" />
                  </>
                )}
                {host && (
                  <Menu.Item className={menuItem} onClick={host.revealInFinder}>
                    <Icon.TreeFolderOpen className="size-4" />
                    Reveal in Finder
                  </Menu.Item>
                )}
                <Menu.Item
                  className={menuItem}
                  onClick={() => openFolderSettings(workspace.id)}
                >
                  <Icon.Settings className="size-4" />
                  {client.theorem ? 'Vault settings…' : 'Folder settings…'}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <Collapsible.Panel className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-(--duration-glide) ease-glide data-ending-style:h-0 data-ending-style:duration-(--duration-exit) data-ending-style:ease-exit data-starting-style:h-0">
        <WorkspaceTree client={client} />
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

/**
 * The Theorem vault and the folders the person opened, each with its live
 * file tree. The vault shows once someone is signed in; folders only in the
 * desktop app, where the workspace routes answer. Below a mode's panel it
 * takes at most half the height; the Vault's Files panel fills itself.
 */
export function FoldersSection({ className }: { className?: string }) {
  const { available, workspaces } = useWorkspaces()
  const openFolder = useOpenFolder()
  if (!available || (!workspaces.length && !openFolder)) return null

  return (
    <section
      aria-label="Files"
      className={cn(
        'flex max-h-[50%] min-h-0 shrink-0 flex-col border-t border-separator',
        className,
      )}
    >
      <div className="flex h-9 shrink-0 items-center ps-3.5 pe-2 text-xs font-medium text-ink-faint-sheet">
        <h2 className="flex-1">Files</h2>
        {workspaces.length > 0 && (
          <TooltipIconButton
            tooltip="Search"
            className="size-7 p-1.5"
            onClick={() => openSearch()}
          >
            <Icon.Search className="size-4" />
          </TooltipIconButton>
        )}
        {openFolder && (
          <TooltipIconButton
            tooltip="Open folder"
            className="size-7 p-1.5"
            disabled={openFolder.isPending}
            onClick={() => openFolder.mutate()}
          >
            <Icon.Add className="size-4" />
          </TooltipIconButton>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {workspaces.length ? (
          workspaces.map((workspace) => (
            <WorkspaceSection key={workspace.id} workspace={workspace} />
          ))
        ) : (
          <p className="px-1.5 text-sm text-ink-faint-sheet">
            Open a folder to work with its files here.
          </p>
        )}
      </div>
    </section>
  )
}
