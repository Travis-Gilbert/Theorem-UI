// SOURCING: Base UI ToggleGroup + Toggle (mode switch), ui/tooltip over Base UI Tooltip, @tanstack/react-router (each mode is a route), assistant-ui Thread element, the IDE frame (browser-only Theia)
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useMatches, useNavigate } from '@tanstack/react-router'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { IdeFrame } from '@/components/ide/ide-frame'
import { Icon } from '@/components/icons'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useShell } from './shell-state'

export type ShellMode = 'chat' | 'spaces' | 'ide'

const MODES = [
  { mode: 'chat', label: 'Chat', Mark: Icon.Chat },
  { mode: 'spaces', label: 'Spaces', Mark: Icon.Spaces },
  { mode: 'ide', label: 'IDE', Mark: Icon.Ide },
] as const

export const modeLabel = (mode: ShellMode) =>
  MODES.find((entry) => entry.mode === mode)!.label

/**
 * The mode is the route: /spaces and /ide, and chat everywhere else. It reads
 * the router's matches, as useParams does, so the mode and the thread id
 * always describe the same navigation.
 */
export function useShellMode(): ShellMode {
  return useMatches({
    select: (matches) => {
      for (const { routeId } of matches) {
        if (routeId === '/_chat/spaces') return 'spaces'
        if (routeId === '/_chat/ide') return 'ide'
      }
      return 'chat'
    },
  })
}

/** Navigates to a mode; chat returns to the conversation last left. */
export function useOpenMode() {
  const navigate = useNavigate()
  return (next: ShellMode) => {
    if (next === 'spaces') return navigate({ to: '/spaces' })
    if (next === 'ide') return navigate({ to: '/ide' })
    const threadId = useShell.getState().chatThreadId
    return threadId
      ? navigate({ to: '/c/$threadId', params: { threadId } })
      : navigate({ to: '/' })
  }
}

/** Chat, Spaces and IDE as one segmented control. */
export function ModeSwitch() {
  const mode = useShellMode()
  const open = useOpenMode()

  return (
    <TooltipProvider>
      <ToggleGroup
        aria-label="Mode"
        value={[mode]}
        // Pressing the current mode again would leave none pressed; one always is.
        onValueChange={([next]) => {
          if (next && next !== mode) void open(next)
        }}
        className="flex shrink-0 items-center gap-0.5 rounded-lg bg-frame p-0.5"
      >
        {MODES.map(({ mode: value, label, Mark }) => (
          <Tooltip key={value}>
            <TooltipTrigger
              render={
                <Toggle
                  value={value}
                  aria-label={label}
                  className="flex size-6 items-center justify-center rounded-md text-ink-faint transition-colors outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-focus data-pressed:bg-raised data-pressed:text-ink data-pressed:shadow-xs"
                />
              }
            >
              <Mark className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </TooltipProvider>
  )
}

function ModePlaceholder({ mode }: { mode: ShellMode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="font-heading text-[20px] font-normal tracking-tight">
        {modeLabel(mode)}
      </p>
      <p className="max-w-sm text-sm text-ink-muted">
        {modeLabel(mode)} is not in Theorem UI yet. Conversations stay in the
        sidebar, and Chat returns to the one you left.
      </p>
    </div>
  )
}

/**
 * The view for the current mode. The conversation stays mounted behind the
 * other modes, so its scroll position and composer draft survive a switch.
 * In the dock the IDE is a panel of its own, so the conversation stays in
 * view beside it; on a phone the IDE takes the screen.
 */
export function ModeView({ docked = false }: { docked?: boolean }) {
  const mode = useShellMode()
  const showThread = mode === 'chat' || (docked && mode === 'ide')
  return (
    <>
      <div hidden={!showThread} className="h-full">
        <Thread />
      </div>
      {mode === 'ide' && !docked && <IdeFrame />}
      {mode === 'spaces' && <ModePlaceholder mode={mode} />}
    </>
  )
}
