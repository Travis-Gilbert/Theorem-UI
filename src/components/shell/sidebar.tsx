// SOURCING: assistant-ui ThreadList element parts (restyled), Base UI Menu (project switcher), ui/dialog over Base UI Dialog (new project), next-themes (theme toggle)
import { Menu } from '@base-ui/react/menu'
import { useNavigate } from '@tanstack/react-router'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  ThreadListItems,
  ThreadListNew,
  ThreadListRoot,
  ThreadListSearch,
} from '@/components/assistant-ui/elements/thread-list.aui'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { IconTile } from '@/components/ui/icon-tile'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { describeError } from '@/lib/theorem/client'
import { useActiveProject, useCreateProject } from './projects'
import { useShell } from './shell-state'

const menuItem =
  'flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none select-none data-highlighted:bg-hover'

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
            <DialogTitle className="text-base font-semibold">
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
              className="h-8 w-full justify-start gap-2 rounded-md px-2.5 text-sm font-normal hover:bg-hover data-popup-open:bg-hover"
            />
          }
        >
          <IconTile size="md">
            <Icon.Projects className="size-4" />
          </IconTile>
          <span className="min-w-0 flex-1 truncate text-start">
            {project?.title ?? 'Project'}
          </span>
          <Icon.Next className="size-3 shrink-0 rotate-90 text-ink-faint" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            side="bottom"
            align="start"
            sideOffset={4}
            className="z-50"
          >
            <Menu.Popup className="w-(--anchor-width) min-w-52 origin-(--transform-origin) rounded-lg border border-separator bg-popover p-1 text-popover-foreground shadow-popover outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
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

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  return (
    <TooltipIconButton
      tooltip={dark ? 'Light theme' : 'Dark theme'}
      side="top"
      className="size-9 p-2"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? (
        <Icon.Sun className="size-[18px]" />
      ) : (
        <Icon.Moon className="size-[18px]" />
      )}
    </TooltipIconButton>
  )
}

/** Sidebar body, shared by the desktop column and the phone drawer. */
export function SidebarContents({
  onClose,
  closeLabel = 'Close sidebar',
}: {
  /** Omitted where the sidebar cannot be closed, as when it is docked in the grid. */
  onClose?: () => void
  closeLabel?: string
}) {
  const [search, setSearch] = useState('')

  return (
    <ThreadListRoot className="flex h-full flex-col gap-0">
      <div className="flex h-14 shrink-0 items-center justify-between ps-4 pe-2">
        <span className="text-[17px] font-semibold leading-none">
          Theorem
        </span>
        {onClose && (
          <TooltipIconButton
            tooltip={closeLabel}
            className="size-9 p-2"
            onClick={onClose}
          >
            <Icon.Layout className="size-[18px]" />
          </TooltipIconButton>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-0.5 px-2">
        <ThreadListNew className="w-full" />
        <ProjectSwitcher />
        <ThreadListSearch value={search} onValueChange={setSearch} />
      </div>
      <nav
        aria-label="Chats"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      >
        <ThreadListItems searchQuery={search} />
      </nav>
      <div className="flex shrink-0 items-center border-t border-separator px-2 py-2">
        <ThemeToggle />
      </div>
    </ThreadListRoot>
  )
}
