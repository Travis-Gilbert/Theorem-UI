// SOURCING: Base UI Menu (account menu), ui/tooltip over Base UI Tooltip, next-themes (theme), the shell's mode routes and tenant hook, the sign-in helpers (sign out)
import { Menu } from '@base-ui/react/menu'
import { useTheme } from 'next-themes'
import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '@/components/icons'
import { signOut, useSignInConfigured } from '@/lib/theorem/sign-in'
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

/** The signed-in tenant as an initial outlined in the accent, with the theme choice behind it. */
function AccountMenu() {
  const { theme, setTheme } = useTheme()
  const tenant = useTenant()
  const signIn = useSignInConfigured()

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={tenant ? `Account, ${tenant}` : 'Account'}
        className="flex size-8 items-center justify-center rounded-[9px] border-[1.5px] border-redwood pt-px font-heading text-[18px] leading-none text-redwood transition-colors duration-100 outline-none hover:bg-redwood/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-popup-open:bg-redwood/15"
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

/**
 * The sheet reaching into the rail behind the active destination: a tab whose
 * right end flows into the sheet's edge through two concave corners. It paints
 * the sheet's gradient at its own height, so the join has no seam, and slides
 * when the mode changes.
 */
function Junction({ y, t }: { y: number; t: number }) {
  return (
    <div
      aria-hidden="true"
      className="rail-junction"
      style={{ '--rail-y': `${y}px`, '--rail-t': t } as CSSProperties}
    >
      <span className="rail-junction-tab" />
      <span className="rail-junction-corner" data-edge="top" />
      <span className="rail-junction-corner" data-edge="bottom" />
    </div>
  )
}

/**
 * The global rail: one destination per mode, and the account at the foot.
 * It is the base the sheet sits on, and stacks above the sheet's shadow and
 * glow so the junction's tab stays level with the panel it joins. The first
 * destination sits low enough that the junction's upper corner clears the
 * sheet's rounded corner. On the desktop the active destination also shows
 * and hides its mode's panel.
 */
export function Rail({ collapsible = false }: { collapsible?: boolean }) {
  const mode = useShellMode()
  const openMode = useOpenMode()
  const panelOpen = useShell((s) => !s.panelCollapsed[mode])
  const togglePanel = useShell((s) => s.togglePanel)

  const railRef = useRef<HTMLDivElement>(null)
  const destinations = useRef(new Map<ShellMode, HTMLButtonElement>())
  const [junction, setJunction] = useState<{ y: number; t: number }>()
  useLayoutEffect(() => {
    const rail = railRef.current
    const active = destinations.current.get(mode)
    if (!rail || !active) return
    const box = rail.getBoundingClientRect()
    const y = active.getBoundingClientRect().top - box.top
    // How far down the rail the tab sits, for the glow colour it takes.
    setJunction({ y, t: box.height ? y / box.height : 0 })
  }, [mode])

  return (
    <div
      ref={railRef}
      className="relative z-10 flex h-full w-rail shrink-0 flex-col items-center pt-[calc(var(--sheet-inset)+24px)] pb-3"
    >
      {junction && <Junction y={junction.y} t={junction.t} />}
      <TooltipProvider>
        <nav aria-label="Modes" className="flex flex-col gap-1">
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
