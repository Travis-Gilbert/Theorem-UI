// SOURCING: assistant-ui ThreadList element parts (restyled), Base UI Menu (project switcher, account menu), Base UI ToggleGroup via ModeSwitch, ui/avatar over Base UI Avatar, ui/dialog over Base UI Dialog (new project), next-themes (theme), @tanstack/react-query (session bootstrap)
import { Menu } from '@base-ui/react/menu'
import { useQuery } from '@tanstack/react-query'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { bootstrap, describeError } from '@/lib/theorem/client'
import { ModeSwitch } from './modes'
import { useActiveProject, useCreateProject } from './projects'
import { useShell } from './shell-state'

const menuItem =
  'flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none select-none data-highlighted:bg-hover'

const menuPopup =
  'origin-(--transform-origin) rounded-lg border border-separator bg-popover p-1 text-popover-foreground shadow-popover outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0'

/** A top-level sidebar row: New chat and the project switcher. */
const navRow =
  'h-8 w-full justify-start gap-2 rounded-md px-2 text-sm font-normal hover:bg-hover'

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
              className={`${navRow} data-popup-open:bg-hover`}
            />
          }
        >
          <Icon.Projects className="size-4 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-start">
            {project?.title ?? 'Project'}
          </span>
          <Icon.Next className="size-2.5 shrink-0 rotate-90 text-ink-faint" />
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

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match system' },
]

/** "Travis-Gilbert" reads as TG; a single word gives its first two letters. */
function initials(name: string) {
  const [first = '', second] = name.split(/[\s._-]+/).filter(Boolean)
  return (
    second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2)
  ).toUpperCase()
}

/** The signed-in tenant, with the theme choice behind it. */
function AccountMenu() {
  const { theme, setTheme } = useTheme()
  const { data } = useQuery({
    queryKey: ['theorem', 'bootstrap'],
    queryFn: () => bootstrap(),
    staleTime: Infinity,
  })
  const tenant = data?.tenantId

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            className="h-10 w-full justify-start gap-2.5 rounded-md px-2 text-sm font-normal hover:bg-hover data-popup-open:bg-hover"
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-selected text-[10px] font-medium text-ink">
            {tenant ? initials(tenant) : null}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-start">
          {tenant ?? 'Theorem'}
        </span>
        <Icon.Next className="size-2.5 shrink-0 -rotate-90 text-ink-faint" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="top"
          align="start"
          sideOffset={4}
          className="z-50"
        >
          <Menu.Popup className={`w-(--anchor-width) min-w-52 ${menuPopup}`}>
            <Menu.Group>
              <Menu.GroupLabel className="px-2 pt-1 pb-1.5 text-xs text-ink-faint">
                Theme
              </Menu.GroupLabel>
              <Menu.RadioGroup
                value={theme}
                onValueChange={(value) => setTheme(String(value))}
              >
                {THEMES.map(({ value, label }) => (
                  <Menu.RadioItem
                    key={value}
                    value={value}
                    className={`${menuItem} data-checked:font-medium`}
                  >
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <Menu.RadioItemIndicator>
                      <Icon.Check className="size-3.5" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
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
    <ThreadListRoot className="flex h-full flex-col">
      <div className="@container/header flex h-12 shrink-0 items-center gap-1 px-2">
        {onClose && (
          <TooltipIconButton
            tooltip={closeLabel}
            className="size-7 p-1.5"
            onClick={onClose}
          >
            <Icon.Layout className="size-4" />
          </TooltipIconButton>
        )}
        {/* The wordmark gives way to the mode switch in a narrow sidebar. */}
        <span className="min-w-0 flex-1 truncate ps-1 font-heading text-[19px] leading-none font-normal tracking-tight @max-[12.5rem]/header:invisible">
          Theorem
        </span>
        <ModeSwitch />
      </div>
      <div className="flex shrink-0 flex-col gap-px px-2 pb-1">
        <div className="pb-1.5">
          <ThreadListSearch value={search} onValueChange={setSearch} />
        </div>
        <ThreadListNew className="w-full" />
        <ProjectSwitcher />
      </div>
      <nav
        aria-label="Chats"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      >
        <ThreadListItems searchQuery={search} />
      </nav>
      <div className="shrink-0 border-t border-separator p-1.5">
        <AccountMenu />
      </div>
    </ThreadListRoot>
  )
}
