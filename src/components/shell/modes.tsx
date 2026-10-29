// SOURCING: @tanstack/react-router (each mode is a route), assistant-ui Thread element, the Spaces canvas (React Flow), the IDE frame (browser-only Theia), the Vault's file list on a phone (FoldersSection)
import { useMatches, useNavigate } from '@tanstack/react-router'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { Canvas } from '@/components/canvas/canvas'
import { IdeFrame } from '@/components/ide/ide-frame'
import { Icon } from '@/components/icons'
import { VaultPhone } from '@/components/vault/vault-phone'
import { useShell } from './shell-state'

export type ShellMode = 'chat' | 'vault' | 'spaces' | 'ide'

/** The rail's destinations, in order. */
export const MODES = [
  { mode: 'chat', label: 'Chat', Mark: Icon.Chat },
  // The Vault works on opened folders, which only the desktop app has.
  { mode: 'vault', label: 'Vault', Mark: Icon.Vault, folders: true },
  { mode: 'spaces', label: 'Spaces', Mark: Icon.Spaces },
  { mode: 'ide', label: 'IDE', Mark: Icon.Ide },
] as const

export const modeLabel = (mode: ShellMode) =>
  MODES.find((entry) => entry.mode === mode)!.label

/**
 * The mode is the route: /vault, /spaces and /ide, and chat everywhere else. It reads
 * the router's matches, as useParams does, so the mode and the thread id
 * always describe the same navigation.
 */
export function useShellMode(): ShellMode {
  return useMatches({
    select: (matches) => {
      for (const { routeId } of matches) {
        if (routeId === '/_chat/vault') return 'vault'
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
    if (next === 'vault') return navigate({ to: '/vault' })
    if (next === 'spaces') return navigate({ to: '/spaces' })
    if (next === 'ide') return navigate({ to: '/ide' })
    const threadId = useShell.getState().chatThreadId
    return threadId
      ? navigate({ to: '/c/$threadId', params: { threadId } })
      : navigate({ to: '/' })
  }
}

/**
 * The view for the current mode. The conversation stays mounted behind the
 * other modes, so its scroll position and composer draft survive a switch.
 * On the desktop Theia and the Vault cover the whole sheet, so the dock keeps
 * the conversation laid out beneath them; on a phone they take the screen.
 */
export function ModeView({ docked = false }: { docked?: boolean }) {
  const mode = useShellMode()
  const showThread =
    mode === 'chat' || (docked && (mode === 'ide' || mode === 'vault'))
  return (
    <>
      <div hidden={!showThread} className="h-full">
        <Thread />
      </div>
      {mode === 'ide' && !docked && <IdeFrame />}
      {mode === 'vault' && !docked && <VaultPhone />}
      {mode === 'spaces' && <Canvas />}
    </>
  )
}
