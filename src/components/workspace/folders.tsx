// SOURCING: coss ui Sidebar (the section's group parts), Base UI Collapsible (each folder folds, its row marked as the
// tree's rows are, by the filesystem-item component) and Menu (a folder's own
// commands, styled as the project switcher's), the assistant-ui
// TooltipIconButton (Search, Open folder), WorkspaceTree (@headless-tree/react),
// the workspace hooks (react-query over the desktop workspace routes and the
// Theorem Files API), the sign-in helpers (Home's sign-in link)
import { Collapsible } from '@base-ui/react/collapsible'
import { Menu } from '@base-ui/react/menu'
import { useState } from 'react'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from '@/components/coss/sidebar'
import { Icon } from '@/components/icons'
import { menuItem, menuPopup } from '@/components/shell/sidebar'
import { Button, buttonVariants } from '@/components/ui/button'
import { FilesystemMarks } from '@/components/ui/filesystem-item'
import { hostActions } from '@/lib/handlers/actions'
import { signInHref, useSignInConfigured } from '@/lib/theorem/sign-in'
import { cn } from '@/lib/utils'
import { describeError } from '@/lib/theorem/client'
import { openTodaysNote } from '@/lib/workspace/notes'
import { isTheoremWorkspace } from '@/lib/workspace/theorem-client'
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

import { useSessionState } from '@/components/shell/projects'

function WorkspaceSection({
  workspace,
  name = workspace.name,
}: {
  workspace: WorkspaceSummary
  /** What the navigator calls it; the Theorem vault is Home. */
  name?: string
}) {
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
          className="flex h-8 w-full items-center gap-1.5 rounded-md ps-2 pe-8 text-start text-sm transition-colors duration-100 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        >
          <FilesystemMarks
            folder
            open={open}
            icon={
              client.theorem && (
                <Icon.TheoremVault
                  aria-hidden="true"
                  className="size-4 shrink-0 text-ink-muted"
                />
              )
            }
          />
          <span className="min-w-0 truncate">{name}</span>
        </Collapsible.Trigger>
        <Menu.Root>
          <Menu.Trigger
            aria-label={`${name} actions`}
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
                  <Icon.NewNote className="size-4" />
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
                  {client.theorem ? 'Home settings…' : 'Folder settings…'}
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

const groupLabel =
  'flex h-8 items-center ps-2 pe-1 text-sm text-ink-faint-sheet'

/** Preserve the reason Home could not open, including signed-in failures. */
type HomeAbsence =
  | 'loading'
  | 'signed-out'
  | 'forbidden'
  | 'unsupported'
  | 'unconfigured'
  | 'failed'
export function homeAbsence({
  isPending,
  signIn,
  signedOut,
  vaultAbsence,
}: {
  isPending: boolean
  signIn: boolean
  signedOut: boolean
  vaultAbsence?: Exclude<HomeAbsence, 'loading'>
}): HomeAbsence | null {
  if (isPending) return 'loading'
  if (signIn && (signedOut || vaultAbsence === 'signed-out'))
    return 'signed-out'
  return vaultAbsence && vaultAbsence !== 'signed-out' ? vaultAbsence : null
}

/** Home remains visible when its authority fails, with an explicit retry. */
export function HomeAbsent({
  absence,
  error,
  retry,
  retrying = false,
}: {
  absence: HomeAbsence
  error?: unknown
  retry: () => void
  retrying?: boolean
}) {
  if (absence === 'loading')
    return <p className="px-2 text-sm text-ink-faint-sheet">Loading…</p>
  if (absence === 'signed-out')
    return (
      <div className="flex flex-col items-start gap-2 px-2 pb-2">
        <p className="text-sm text-ink-faint-sheet">
          Sign in to keep your files in Home.
        </p>
        <a href={signInHref()} className={buttonVariants({ size: 'sm' })}>
          Sign in
        </a>
      </div>
    )
  const message = {
    forbidden: 'Your account cannot open Home.',
    unsupported: 'Theorem is not serving Files yet.',
    unconfigured: 'Theorem Files is not configured.',
    failed: 'Home could not load. Your files have not been changed.',
  }[absence]
  return (
    <div className="flex flex-col items-start gap-2 px-2 pb-2">
      <p role="alert" className="text-sm text-error-ink">
        {message}
      </p>
      {error instanceof Error && (
        <p className="text-xs text-ink-muted">{describeError(error, 'Files')}</p>
      )}
      <Button size="sm" variant="ghost" disabled={retrying} onClick={retry}>
        {retrying ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  )
}

/**
 * The navigator's files, by where they live: Home, the person's files in
 * Theorem, once someone is signed in; then the folders on this device, which
 * only the desktop app opens. Connected sources will join them as a third
 * group. Below a mode's list it takes at most half the height; revealed from
 * the rail it fills the panel and says how to get files where there are none.
 */
export function FoldersSection({ fill = false }: { fill?: boolean }) {
  const { available, workspaces, vaultAbsence } = useWorkspaces()
  const openFolder = useOpenFolder()
  const vaultFailed =
    vaultAbsence !== undefined && vaultAbsence !== 'signed-out'
  if (
    !fill &&
    !vaultFailed &&
    (!available || (!workspaces.length && !openFolder))
  )
    return null

  return (
    <SidebarGroup
      aria-label="Files"
      className={cn(
        'min-h-0',
        fill ? 'flex-1' : 'max-h-[50%] shrink-0 border-t border-separator',
      )}
    >
      <div className="flex shrink-0 items-center">
        <SidebarGroupLabel render={<h2 />} className="min-w-0 flex-1">
          Files
        </SidebarGroupLabel>
        {workspaces.length > 0 && (
          <TooltipIconButton
            tooltip="Search"
            className="size-7 p-1.5"
            onClick={() => openSearch()}
          >
            <Icon.Search className="size-4" />
          </TooltipIconButton>
        )}
      </div>
      <SidebarGroupContent className="min-h-0 flex-1 overflow-y-auto">
        <FolderTrees fill={fill} />
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

/** Home, then the folders on this device, with no heading of their own. */
export function FolderTrees({ fill = false }: { fill?: boolean }) {
  const {
    workspaces,
    isPending,
    vaultAbsence,
    vaultError,
    retryVault,
    vaultFetching,
  } = useWorkspaces()
  const openFolder = useOpenFolder()
  const home = workspaces.find(isTheoremWorkspace)
  const device = workspaces.filter((workspace) => workspace !== home)
  const session = useSessionState()
  const absence = homeAbsence({
    isPending: isPending || session.isPending,
    vaultAbsence,
    signIn: useSignInConfigured(),
    signedOut: session.signedOut,
  })

  return (
    <>
      {home ? (
        <section aria-label="Home">
          <WorkspaceSection workspace={home} name="Home" />
        </section>
      ) : (
        (fill || absence !== 'signed-out') &&
        absence && (
          <section aria-label="Home">
            <h3 className={groupLabel}>Home</h3>
            <HomeAbsent
              absence={absence}
              error={vaultError}
              retry={() => {
                void retryVault()
              }}
              retrying={vaultFetching}
            />
          </section>
        )
      )}
      {(device.length > 0 || openFolder) && (
        <section aria-label="On this device" className="pt-2">
          <div className={groupLabel}>
            <h3 className="flex-1">On this device</h3>
            {openFolder && (
              <TooltipIconButton
                tooltip="Open folder"
                className="size-6 p-1"
                disabled={openFolder.isPending}
                onClick={() => openFolder.mutate()}
              >
                <Icon.Add className="size-3.5" />
              </TooltipIconButton>
            )}
          </div>
          {device.length ? (
            device.map((workspace) => (
              <WorkspaceSection key={workspace.id} workspace={workspace} />
            ))
          ) : (
            <p className="px-2 text-sm text-ink-faint-sheet">
              Open a folder to work with its files here.
            </p>
          )}
        </section>
      )}
    </>
  )
}
