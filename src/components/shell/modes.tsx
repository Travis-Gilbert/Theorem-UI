// SOURCING: @tanstack/react-router (each mode is a route), assistant-ui Thread element
import { useMatches, useNavigate } from '@tanstack/react-router'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { Icon } from '@/components/icons'
import { useShell } from './shell-state'

export type ShellMode = 'chat' | 'spaces' | 'ide'

/** The rail's destinations, in order. */
export const MODES = [
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

/** Navigates to a mode. Chat returns to the conversation it last showed. */
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

function ModePlaceholder({ mode }: { mode: ShellMode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="font-heading text-[20px] font-normal tracking-tight">
        {modeLabel(mode)}
      </p>
      <p className="max-w-sm text-sm text-ink-muted">
        {modeLabel(mode)} is not in Theorem UI yet. Chat returns to the
        conversation you left.
      </p>
    </div>
  )
}

/**
 * The view for the current mode. The conversation stays mounted behind the
 * other modes, so its scroll position and composer draft survive a switch.
 */
export function ModeView() {
  const mode = useShellMode()
  return (
    <>
      <div hidden={mode !== 'chat'} className="h-full">
        <Thread />
      </div>
      {mode !== 'chat' && <ModePlaceholder mode={mode} />}
    </>
  )
}
