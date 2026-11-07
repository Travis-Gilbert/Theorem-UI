// SOURCING: the organized thread tree (components/organize), the shell's Explorer (headless-tree), Base UI Menu (project switcher), @tanstack/react-query via the shell's project and tenant hooks, FoldersSection (@headless-tree/react, desktop only), SpaceNotes (the canvas's note list), the Index panel, the Notes panel
import { Menu } from '@base-ui/react/menu'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { SpaceNotes } from '@/components/canvas/space-notes'
import { Icon } from '@/components/icons'
import { IndexPanel } from '@/components/index/index-panel'
import { NewProjectDialog } from '@/components/organize/new-project-dialog'
import { OrganizedPanel } from '@/components/organize/organized-panel'
import { Button } from '@/components/ui/button'
import { FoldersSection } from '@/components/workspace/folders'
import { ProgramsPanel } from '@/components/program/programs-panel'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarProvider,
} from '@/components/coss/sidebar'
import { hasOwnView, useShellMode } from './modes'
import { useActiveProject, useTenant } from './projects'
import { useShell } from './shell-state'

import { Explorer } from './explorer'

import { PagesPanel } from '@/components/pages/pages-panel'
import { NotesPanel } from '@/components/notes/notes-panel'

export const menuItem =
  'flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none select-none data-highlighted:bg-hover'

export const menuPopup =
  'origin-(--transform-origin) rounded-lg border border-separator bg-popover p-1 text-popover-foreground shadow-popover outline-none transition-[opacity,scale] duration-(--duration-snap) ease-snap data-ending-style:duration-(--duration-exit) data-ending-style:ease-exit data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0'


function ProjectSwitcher() {
  const { projects, project } = useActiveProject()
  const tenant = useTenant()
  const setProjectId = useShell((s) => s.setProjectId)
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  // Threads belong to a project, so switching starts a new chat in the new one.
  const switchTo = (projectId: string) => {
    if (projectId === project?.projectId) return
    setProjectId(projectId)
    void navigate({ to: '/' })
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          render={
            <Button
              variant="ghost"
              className="h-10 w-full justify-start gap-2 rounded-lg px-2 text-start font-normal hover:bg-hover data-popup-open:bg-hover"
            />
          }
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm leading-tight font-medium">
              {project?.title ?? 'Project'}
            </span>
            <span className="truncate text-xs leading-tight text-ink-faint-sheet">
              {tenant ?? 'Theorem'}
            </span>
          </span>
          <Icon.UpDown className="size-3.5 shrink-0 text-ink-faint" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            side="bottom"
            align="start"
            sideOffset={4}
            className="z-50"
          >
            <Menu.Popup className={`w-(--anchor-width) min-w-52 ${menuPopup}`}>
              <Menu.Group>
                <Menu.GroupLabel className="px-2 pt-1 pb-1.5 text-xs text-ink-faint">
                  Projects
                </Menu.GroupLabel>
                <Menu.RadioGroup
                  value={project?.projectId}
                  onValueChange={(value) => switchTo(String(value))}
                >
                  {projects.map((p) => (
                    <Menu.RadioItem
                      key={p.projectId}
                      value={p.projectId}
                      closeOnClick
                      className={`${menuItem} data-checked:font-medium`}
                    >
                      <span className="min-w-0 flex-1 truncate">{p.title}</span>
                      <Menu.RadioItemIndicator>
                        <Icon.Check className="size-3.5" />
                      </Menu.RadioItemIndicator>
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu.Group>
              <Menu.Separator className="my-1 h-px bg-separator" />
              <Menu.Item className={menuItem} onClick={() => setCreating(true)}>
                <Icon.Add className="size-4" />
                New project
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <NewProjectDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(projectId) => {
          setProjectId(projectId)
          void navigate({ to: '/' })
        }}
      />
    </>
  )
}

/** Spaces' panel: the project, then the notes on its canvas. */
function SpacesPanel() {
  const { project } = useActiveProject()
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center px-1.5">
        <ProjectSwitcher />
      </div>
      <SidebarContent role="navigation" aria-label="Notes on the canvas">
        <SidebarGroup>
          <SidebarGroupLabel>Notes</SidebarGroupLabel>
          <SidebarGroupContent>
            {project && (
              <SpaceNotes
                key={project.projectId}
                projectId={project.projectId}
                title={project.title}
              />
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </div>
  )
}

/**
 * The navigator beside the rail: the active mode's list above the files.
 * Theia covers it in IDE mode, so Chat's panel stays under it. Chat's panel
 * stays mounted behind the Index, Notes, Pages, Spaces, Canvas and the revealed files, so its
 * search, scroll and open branches survive a switch. The rail's Files
 * control reveals the files over the mode's list.
 */
export function ContextPanel() {
  const mode = useShellMode()
  const filesShown = useShell((s) => s.filesShown)
  const threads = !hasOwnView(mode)
  return (
    <SidebarProvider className="on-sheet h-full min-h-0">
      <Sidebar collapsible="none" className="w-full bg-transparent">
        <div hidden={filesShown || !threads} className="min-h-0 flex-1">
          <OrganizedPanel footer={<Explorer />} />
        </div>
        {mode === 'index' && (
          <div hidden={filesShown} className="min-h-0 flex-1">
            <IndexPanel />
          </div>
        )}
        {mode === 'spaces' && (
          <div hidden={filesShown} className="min-h-0 flex-1">
            <SpacesPanel />
          </div>
        )}
        {mode === 'notes' && (
          <div hidden={filesShown} className="min-h-0 flex-1">
            <NotesPanel />
          </div>
        )}
        {mode === 'pages' && (
          <div hidden={filesShown} className="min-h-0 flex-1">
            <PagesPanel />
          </div>
        )}
        {mode === 'canvas' && (
          <div hidden={filesShown} className="min-h-0 flex-1">
            <ProgramsPanel />
          </div>
        )}
        {/* Beside the threads the folders fold into the panel's one Files row. */}
        {(filesShown || !threads) && <FoldersSection fill={filesShown} />}
      </Sidebar>
    </SidebarProvider>
  )
}
