// SOURCING: Base UI Menu (account menu), ui/tooltip over Base UI Tooltip, ui/avatar over Base UI Avatar, next-themes (theme), the shell's mode routes and tenant hook
import { Menu } from '@base-ui/react/menu'
import { useTheme } from 'next-themes'
import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '@/components/icons'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { MODES, useOpenMode, useShellMode } from './modes'
import type { ShellMode } from './modes'
import { useTenant } from './projects'
import { useShell } from './shell-state'
import { menuItem, menuPopup } from './sidebar'

/** The rail's square controls: destinations and the account. */
const railButton =
  'relative flex size-9 items-center justify-center rounded-[10px] text-ink-faint transition-colors duration-100 outline-none hover:bg-ink/8 hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus'

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
  const tenant = useTenant()

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={tenant ? `Account, ${tenant}` : 'Account'}
        className={`${railButton} data-popup-open:bg-ink/8`}
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-selected text-[10px] font-medium text-ink">
            {tenant ? initials(tenant) : null}
          </AvatarFallback>
        </Avatar>
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

/**
 * The sheet reaching into the rail behind the active destination: a tab whose
 * right end flows into the sheet's edge through two concave corners. It paints
 * the sheet's gradient at its own height, so the join has no seam, and slides
 * when the mode changes.
 */
function Junction({ y }: { y: number }) {
  return (
    <div
      aria-hidden="true"
      className="rail-junction"
      style={{ '--rail-y': `${y}px` } as CSSProperties}
    >
      <span className="rail-junction-tab" />
      <span className="rail-junction-corner" data-edge="top" />
      <span className="rail-junction-corner" data-edge="bottom" />
    </div>
  )
}

/**
 * The global rail: the Theorem mark, one destination per mode and the
 * account. It is the base the sheet sits on. On the desktop the active
 * destination also shows and hides its mode's panel.
 */
export function Rail({ collapsible = false }: { collapsible?: boolean }) {
  const mode = useShellMode()
  const openMode = useOpenMode()
  const panelOpen = useShell((s) => !s.panelCollapsed[mode])
  const togglePanel = useShell((s) => s.togglePanel)

  const railRef = useRef<HTMLDivElement>(null)
  const destinations = useRef(new Map<ShellMode, HTMLButtonElement>())
  const [junctionY, setJunctionY] = useState<number>()
  useLayoutEffect(() => {
    const rail = railRef.current
    const active = destinations.current.get(mode)
    if (!rail || !active) return
    setJunctionY(
      active.getBoundingClientRect().top - rail.getBoundingClientRect().top,
    )
  }, [mode])

  return (
    <div
      ref={railRef}
      className="relative flex h-full w-rail shrink-0 flex-col items-center pt-(--sheet-inset) pb-3"
    >
      {junctionY !== undefined && <Junction y={junctionY} />}
      <div className="flex h-12 shrink-0 items-center">
        {/* A stand-in mark until Theorem has one: the wordmark's initial. */}
        <span
          role="img"
          aria-label="Theorem"
          className="flex size-8 items-center justify-center rounded-[9px] bg-redwood pt-px font-heading text-[18px] leading-none text-on-redwood shadow-xs"
        >
          T
        </span>
      </div>
      <TooltipProvider>
        <nav aria-label="Modes" className="mt-2 flex flex-col gap-1">
          {MODES.map(({ mode: value, label, Mark }) => {
            const active = value === mode
            const toggles = active && collapsible
            const tooltip = toggles
              ? `${panelOpen ? 'Hide' : 'Show'} ${label} panel`
              : label
            return (
              <Tooltip key={value}>
                <TooltipTrigger
                  render={
                    <button
                      ref={(node) => {
                        if (node) destinations.current.set(value, node)
                        else destinations.current.delete(value)
                      }}
                      type="button"
                      aria-label={label}
                      aria-current={active ? 'page' : undefined}
                      aria-expanded={toggles ? panelOpen : undefined}
                      onClick={() => {
                        if (!active) void openMode(value)
                        else if (collapsible) togglePanel(value)
                      }}
                      className={`${railButton} aria-[current=page]:text-ink aria-[current=page]:hover:bg-transparent`}
                    />
                  }
                >
                  <Mark className="size-[18px]" />
                </TooltipTrigger>
                <TooltipContent side="right">{tooltip}</TooltipContent>
              </Tooltip>
            )
          })}
        </nav>
      </TooltipProvider>
      <div className="flex-1" />
      <AccountMenu />
    </div>
  )
}
