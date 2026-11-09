// SOURCING: Base UI Menu (account menu), @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/modifiers (reordering the destinations), Kit's home slot (the stage stands the fox in it), the agent terminal toggle, ui/tooltip over Base UI Tooltip, next-themes (theme), lib/palette (colors), the shell's mode routes and tenant hook, the opened folders (whether the Vault is offered), the sign-in helpers (sign out)
import { Menu } from '@base-ui/react/menu'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { Announcements, DragEndEvent } from '@dnd-kit/core'
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTheme } from 'next-themes'
import { useLayoutEffect, useRef, useState } from 'react'
import type {
  ComponentProps,
  CSSProperties,
  KeyboardEvent,
  ReactNode,
} from 'react'
import { Icon } from '@/components/icons'
import { KitPerch } from '@/components/kit/kit-stage'
import { PALETTES, usePalette } from '@/lib/palette'
import type { Palette } from '@/lib/palette'
import { signOut, useSignInConfigured } from '@/lib/theorem/sign-in'
import { useWorkspaces } from '@/lib/workspace/workspaces'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { RailMark } from './rail-marks'
import {
  MODES,
  modeLabel,
  navigatorMode,
  useOpenMode,
  useShellMode,
} from './modes'
import type { ShellMode } from './modes'
import { useTenant } from './projects'
import { useShell } from './shell-state'
import { menuItem, menuPopup } from './sidebar'

import { Link } from '@tanstack/react-router'
import { useCommandPalette } from './command-palette'

/** The rail's square controls: destinations and the account. */
const railButton =
  'group/rail relative flex size-8 items-center justify-center rounded-[10px] text-ink-faint transition-colors duration-100 outline-none hover:bg-ink/8 hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus'

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match system' },
]

/** The signed-in tenant as an initial outlined in the accent, with the theme and color choices behind it. */
function AccountMenu() {
  const { theme, setTheme } = useTheme()
  const { palette, setPalette } = usePalette()
  const tenant = useTenant()
  const signIn = useSignInConfigured()

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={tenant ? `Account, ${tenant}` : 'Account'}
        className="flex size-8 items-center justify-center rounded-[9px] border-[1.5px] border-redwood pt-px font-heading text-[18px] font-semibold leading-none text-redwood transition-colors duration-100 outline-none hover:bg-redwood/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-popup-open:bg-redwood/15"
      >
        {tenant?.charAt(0).toUpperCase()}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="right"
          align="end"
          sideOffset={8}
          className="z-50"
        >
          <Menu.Popup className={`min-w-52 ${menuPopup}`}>
            {tenant && (
              <>
                <div className="truncate px-2 pt-1 pb-1.5 text-sm font-medium">
                  {tenant}
                </div>
                <Menu.Separator className="my-1 h-px bg-separator" />
              </>
            )}
            <Menu.Item className={menuItem} render={<Link to="/settings" />}>
              <Icon.Settings className="size-4 text-ink-muted" />
              <span className="min-w-0 flex-1">Settings</span>
            </Menu.Item>
            <Menu.Item
              className={menuItem}
              onClick={() => useCommandPalette.getState().setOpen(true)}
            >
              <Icon.Search className="size-4 text-ink-muted" />
              <span className="min-w-0 flex-1">Search</span>
              <span className="text-xs text-ink-faint">⌘K</span>
            </Menu.Item>
            <Menu.Separator className="my-1 h-px bg-separator" />
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
            <Menu.Separator className="my-1 h-px bg-separator" />
            <Menu.Group>
              <Menu.GroupLabel className="px-2 pt-1 pb-1.5 text-xs text-ink-faint">
                Colors
              </Menu.GroupLabel>
              <Menu.RadioGroup
                value={palette}
                onValueChange={(value) => setPalette(value as Palette)}
              >
                {PALETTES.map(({ value, label }) => (
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
            {signIn && (
              <>
                <Menu.Separator className="my-1 h-px bg-separator" />
                <Menu.Item className={menuItem} onClick={() => void signOut()}>
                  Sign out
                </Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** Shows and hides the agent terminal drawer. */
function TerminalToggle() {
  const open = useShell((s) => s.terminalOpen)
  const setOpen = useShell((s) => s.setTerminalOpen)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="Agent terminal"
              aria-pressed={open}
              onClick={() => setOpen(!open)}
              className={`${railButton} mb-2 aria-pressed:text-ink`}
            />
          }
        >
          <Icon.Terminal className="size-5" strokeWidth={1.75} />
        </TooltipTrigger>
        <TooltipContent side="right">Agent terminal (ctrl+`)</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * The sheet reaching into the rail behind the active destination: a tab whose
 * right end flows into the sheet's edge through two concave corners. It paints
 * the sheet's gradient at its own height, so the join has no seam, and slides
 * when the mode changes.
 */
function Junction({ y, h, t, flush }: Junction) {
  return (
    <div
      aria-hidden="true"
      className="rail-junction"
      data-flush={flush || undefined}
      style={
        {
          '--rail-y': `${y}px`,
          '--junction-item': `${h}px`,
          '--rail-t': t,
        } as CSSProperties
      }
    >
      <span className="rail-junction-tab" />
      <span className="rail-junction-corner" data-edge="top" />
      <span className="rail-junction-corner" data-edge="bottom" />
    </div>
  )
}

type Junction = { y: number; h: number; t: number; flush: boolean }

/**
 * Reveals the files in the navigator beside the rail, over the mode's own
 * list, and hides them again. It changes what the panel shows, not where the
 * person is. On the desktop the IDE and the Vault cover the panel, so from them
 * it goes back to Chat; a phone's drawer shows the panel over every mode.
 */
function FilesControl({ collapsible }: { collapsible: boolean }) {
  const mode = useShellMode()
  const openMode = useOpenMode()
  const panelMode = navigatorMode(mode)
  const panelOpen = useShell((s) => !s.panelCollapsed[panelMode])
  const filesShown = useShell((s) => s.filesShown)
  const covered = collapsible && panelMode !== mode
  const showing = filesShown && !covered && (panelOpen || !collapsible)
  const toggle = () => {
    const shell = useShell.getState()
    if (showing) return shell.setFilesShown(false)
    shell.setPanelOpen(panelMode, true)
    shell.setFilesShown(true)
    if (covered) void openMode('chat')
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="Files"
            aria-pressed={showing}
            onClick={toggle}
            className={`${railButton} h-12 aria-pressed:text-ink`}
          />
        }
      >
        <RailMark.Files className="size-5" />
      </TooltipTrigger>
      <TooltipContent side="right">
        {showing ? 'Hide files' : 'Show files'}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The rail's destinations in the order the person dragged them into. Modes the
 * saved order does not name, such as one added since, follow in their default
 * order.
 */
export function orderModes(order: readonly ShellMode[]) {
  const rank = (mode: ShellMode) => {
    const saved = order.indexOf(mode)
    return saved < 0
      ? order.length + MODES.findIndex((entry) => entry.mode === mode)
      : saved
  }
  return [...MODES].sort((a, b) => rank(a.mode) - rank(b.mode))
}

/** What a screen reader hears while a destination is dragged. */
const announcements: Announcements = {
  onDragStart: ({ active }) =>
    `Picked up ${modeLabel(active.id as ShellMode)}.`,
  onDragOver: ({ active, over }) =>
    over && active.id !== over.id
      ? `${modeLabel(active.id as ShellMode)} is over ${modeLabel(over.id as ShellMode)}.`
      : undefined,
  onDragEnd: ({ active, over }) =>
    over && active.id !== over.id
      ? `${modeLabel(active.id as ShellMode)} moved to ${modeLabel(over.id as ShellMode)}'s place.`
      : `${modeLabel(active.id as ShellMode)} stayed in place.`,
  onDragCancel: ({ active }) =>
    `${modeLabel(active.id as ShellMode)} stayed in place.`,
}

/**
 * One destination, which drags to a new place on the rail. The press still
 * opens it: a drag starts only after the pointer travels, and the click that
 * ends a drag is dropped by the rail.
 */
function Destination({
  mode,
  register,
  onMove,
  className,
  children,
  ...button
}: Omit<ComponentProps<'button'>, 'onKeyDown'> & {
  mode: ShellMode
  register: (mode: ShellMode, node: HTMLButtonElement | null) => void
  onMove: (mode: ShellMode, by: -1 | 1) => void
  children: ReactNode
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: mode })
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey) return
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    onMove(mode, event.key === 'ArrowUp' ? -1 : 1)
  }
  return (
    <button
      {...button}
      {...attributes}
      {...listeners}
      ref={(node) => {
        setNodeRef(node)
        register(mode, node)
      }}
      type="button"
      onKeyDown={onKeyDown}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${className} touch-none ${isDragging ? 'z-10 cursor-grabbing' : ''}`}
    >
      {children}
    </button>
  )
}

/**
 * The global rail: one destination per mode, and Kit, the terminal and the
 * account at the foot. Destinations drag into the order the person wants, and
 * keep their colours as they move.
 * It is the base the sheet sits on, and stacks above the sheet's shadow and
 * glow so the junction's tab stays level with the panel it joins. The first
 * destination is flush with the sheet's top, so its tab continues the sheet's
 * top edge. On the desktop the active destination also shows and hides its
 * mode's panel.
 */
export function Rail({ collapsible = false }: { collapsible?: boolean }) {
  const mode = useShellMode()
  const openMode = useOpenMode()
  const panelOpen = useShell((s) => !s.panelCollapsed[mode])
  const togglePanel = useShell((s) => s.togglePanel)
  const railOrder = useShell((s) => s.railOrder)
  const setRailOrder = useShell((s) => s.setRailOrder)
  // The Vault works on opened folders, so it is offered where they can be.
  const folders = useWorkspaces().available
  const ordered = orderModes(railOrder)
  const modes = ordered.filter(
    (entry) => folders || !('folders' in entry) || entry.mode === mode,
  )
  const order = modes.map((entry) => entry.mode).join()

  const railRef = useRef<HTMLDivElement>(null)
  const destinations = useRef(new Map<ShellMode, HTMLButtonElement>())
  const register = (value: ShellMode, node: HTMLButtonElement | null) => {
    if (node) destinations.current.set(value, node)
    else destinations.current.delete(value)
  }
  const [junction, setJunction] = useState<Junction>()
  useLayoutEffect(() => {
    const rail = railRef.current
    const active = destinations.current.get(mode)
    if (!rail || !active) return
    const box = rail.getBoundingClientRect()
    const { top, height } = active.getBoundingClientRect()
    const y = top - box.top
    // How far down the rail the tab sits, for the glow colour it takes.
    setJunction({
      y,
      h: height,
      t: box.height ? y / box.height : 0,
      flush: mode === order.split(',')[0],
    })
  }, [mode, order])

  /** Puts `moved` where `target` is, among every mode, hidden ones included. */
  const place = (moved: ShellMode, target: ShellMode) => {
    const all = ordered.map((entry) => entry.mode)
    const from = all.indexOf(moved)
    const to = all.indexOf(target)
    if (from !== to) setRailOrder(arrayMove(all, from, to))
  }
  const move = (moved: ShellMode, by: -1 | 1) => {
    const shown = modes.map((entry) => entry.mode)
    const target = shown[shown.indexOf(moved) + by]
    if (target) place(moved, target)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )
  // The release that ends a drag also clicks the destination under it.
  const dragged = useRef(false)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setTimeout(() => (dragged.current = false))
    if (over) place(active.id as ShellMode, over.id as ShellMode)
  }

  return (
    <div
      ref={railRef}
      className="relative z-10 flex h-full w-rail shrink-0 flex-col items-center pt-(--sheet-inset) pb-3"
    >
      {junction && <Junction {...junction} />}
      <TooltipProvider>
        <DndContext
          id="rail-modes"
          sensors={sensors}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                'Drag to reorder, or press Alt with the up or down arrow to move this destination.',
            },
          }}
          onDragStart={() => (dragged.current = true)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setTimeout(() => (dragged.current = false))}
        >
          <SortableContext
            items={modes.map((entry) => entry.mode)}
            strategy={verticalListSortingStrategy}
          >
            <nav aria-label="Modes" className="flex flex-col gap-1">
              {modes.map(({ mode: value, label, Mark }) => {
                const active = value === mode
                const toggles = active && collapsible
                const tooltip = toggles
                  ? `${panelOpen ? 'Hide' : 'Show'} ${label} panel`
                  : label
                return (
                  <Tooltip key={value}>
                    <TooltipTrigger
                      render={
                        <Destination
                          mode={value}
                          register={register}
                          onMove={move}
                          aria-label={label}
                          aria-current={active ? 'page' : undefined}
                          aria-expanded={toggles ? panelOpen : undefined}
                          onClick={() => {
                            if (dragged.current) return
                            if (!active) void openMode(value)
                            else if (collapsible) togglePanel(value)
                          }}
                          className={`${railButton} h-12 aria-[current=page]:text-ink aria-[current=page]:hover:bg-transparent`}
                        >
                          <Mark className="size-5" />
                        </Destination>
                      }
                    />
                    <TooltipContent side="right">{tooltip}</TooltipContent>
                  </Tooltip>
                )
              })}
            </nav>
          </SortableContext>
        </DndContext>
        <div aria-hidden="true" className="my-2 h-px w-5 bg-separator" />
        <FilesControl collapsible={collapsible} />
      </TooltipProvider>
      <div className="flex-1" />
      <KitPerch name="rail" className="mb-1" />
      <TerminalToggle />
      <AccountMenu />
    </div>
  )
}
