// SOURCING: assistant-ui ThreadList element parts (restyled), the shell's Explorer (headless-tree), Base UI Menu (project switcher), ui/dialog over Base UI Dialog (new project), @tanstack/react-query via the shell's project and tenant hooks, FoldersSection (@headless-tree/react, desktop only), SpaceNotes (the canvas's note list)
import { Menu } from '@base-ui/react/menu'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  ThreadListItems,
  ThreadListNew,
  ThreadListRoot,
  ThreadListSearch,
} from '@/components/assistant-ui/elements/thread-list.aui'
import { SpaceNotes } from '@/components/canvas/space-notes'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FoldersSection } from '@/components/workspace/folders'
import { describeError } from '@/lib/theorem/client'
import { useShellMode } from './modes'
import { useActiveProject, useCreateProject, useTenant } from './projects'
import { useShell } from './shell-state'

import { Explorer } from './explorer'

export const menuItem =
  'flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none select-none data-highlighted:bg-hover'

export const menuPopup =
  'origin-(--transform-origin) rounded-lg border border-separator bg-popover p-1 text-popover-foreground shadow-popover outline-none transition-[opacity,scale] duration-(--duration-snap) ease-snap data-ending-style:duration-(--duration-exit) data-ending-style:ease-exit data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0'

function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const create = useCreateProject()
  const [title, setTitle] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = title.trim()
    if (!next) return
    create.mutate(next, {
      onSuccess: () => {
        setTitle('')
        onOpenChange(false)
        onCreated()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-normal tracking-tight">
              New project
            </DialogTitle>
            <DialogDescription>
              Projects keep related chats together.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Project name"
            placeholder="Project name"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          {create.error && (
            <p role="alert" className="text-sm text-error-ink">
              {describeError(create.error)}
            </p>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={!title.trim() || create.isPending}
              className="bg-redwood text-on-redwood hover:bg-redwood-hover"
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

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
        onCreated={() => void navigate({ to: '/' })}
      />
    </>
  )
}

/** Chat's panel: the project, then search, New chat, the conversations and the project's files. */
function ChatPanel() {
  const [search, setSearch] = useState('')

  return (
    <ThreadListRoot className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center px-1.5">
        <ProjectSwitcher />
      </div>
      <div className="flex shrink-0 flex-col gap-px px-2 pb-1">
        <div className="pb-1">
          <ThreadListSearch value={search} onValueChange={setSearch} />
        </div>
        <ThreadListNew className="w-full" />
      </div>
      <nav
        aria-label="Chats"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      >
        <ThreadListItems searchQuery={search} />
      </nav>
      <Explorer />
    </ThreadListRoot>
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
      <nav
        aria-label="Notes on the canvas"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      >
        <p className="px-2 pt-2 pb-1 text-xs text-ink-faint-sheet">Notes</p>
        {project && (
          <SpaceNotes
            key={project.projectId}
            projectId={project.projectId}
            title={project.title}
          />
        )}
      </nav>
    </div>
  )
}

/**
 * The panel beside the rail belongs to the active mode. Theia covers it in
 * IDE mode, so Chat's panel stays under it. Chat's panel stays mounted behind
 * Spaces, so its search, scroll and open branches survive a switch. The
 * desktop app's folders sit below every mode's panel.
 */
export function ContextPanel() {
  const mode = useShellMode()
  return (
    <div className="on-sheet flex h-full flex-col">
      <div hidden={mode === 'spaces'} className="min-h-0 flex-1">
        <ChatPanel />
      </div>
      {mode === 'spaces' && (
        <div className="min-h-0 flex-1">
          <SpacesPanel />
        </div>
      )}
      <FoldersSection />
    </div>
  )
}
