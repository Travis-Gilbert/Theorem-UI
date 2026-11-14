// SOURCING: @tanstack/react-router (each mode is a route), assistant-ui Thread element, the Spaces canvas (React Flow), the IDE frame (browser-only Theia), the Vault's file list on a phone (FoldersSection), the program canvas (React Flow), Index mode (its page, pages/mode-page.tsx), Pages (Puck over the vault's page files; a mode's page opens there to be arranged), Notes (Theorem documents in the Milkdown note editor), a project's home in chat mode (components/projects/project-home)
import { Canvas } from '@/components/canvas/canvas'
import { ProgramSurface } from '@/components/program/program-surface'
import { RailMark } from './rail-marks'
import { IdeFrame } from '@/components/ide/ide-frame'
import { LifeBackdrop } from '@/components/life/life-backdrop'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { VaultPhone } from '@/components/vault/vault-phone'
import { useCallback } from 'react'
import { useMatches, useNavigate, useParams } from '@tanstack/react-router'
import { IndexMode } from '@/components/pages/mode-page'
import { NotesView } from '@/components/notes/notes-view'
import { ProjectHome } from '@/components/projects/project-home'
import {
  ModePageView,
  PageStatus,
  PageView,
} from '@/components/pages/page-view'
import { isPageMode } from '@/lib/modules/templates'
import { useShell } from './shell-state'

export type ShellMode =
  | 'chat'
  | 'index'
  | 'notes'
  | 'pages'
  | 'vault'
  | 'spaces'
  | 'canvas'
  | 'ide'

/** The rail's destinations, in order. */
export const MODES = [
  { mode: 'chat', label: 'Home', Mark: RailMark.Home },
  { mode: 'index', label: 'Index', Mark: RailMark.Index },
  { mode: 'notes', label: 'Notes', Mark: RailMark.Notes },
  { mode: 'pages', label: 'Pages', Mark: RailMark.Pages },
  // The Vault works on Home and the opened folders; the rail offers it while
  // there are any.
  { mode: 'vault', label: 'Vault', Mark: RailMark.Vault, folders: true },
  { mode: 'spaces', label: 'Spaces', Mark: RailMark.Spaces },
  { mode: 'canvas', label: 'Canvas', Mark: RailMark.Canvas },
  { mode: 'ide', label: 'IDE', Mark: RailMark.Ide },
] as const

/** The modes that show their own view and list in place of the conversation and its threads. */
export const hasOwnView = (mode: ShellMode) =>
  mode === 'index' ||
  mode === 'notes' ||
  mode === 'pages' ||
  mode === 'spaces' ||
  mode === 'canvas'

/**
 * Whether the file tree sits under the mode's own list. Notes keeps its own
 * folders and ends with its Trash; the rail's Files control still shows the
 * files there.
 */
export const filesUnderPanel = (mode: ShellMode) =>
  hasOwnView(mode) && mode !== 'notes'

export const modeLabel = (mode: ShellMode) =>
  MODES.find((entry) => entry.mode === mode)!.label

/**
 * The mode whose panel beside the rail shows: the Vault covers the sheet, so
 * Chat's panel stays under it. The IDE has its own, its sessions.
 */
export const navigatorMode = (mode: ShellMode): ShellMode =>
  mode === 'vault' ? 'chat' : mode

/**
 * The mode is the route: /index, /notes, /pages, /vault, /spaces, /canvas and /ide, and chat everywhere else. It reads
 * the router's matches, as useParams does, so the mode and the thread id
 * always describe the same navigation.
 */
export function useShellMode(): ShellMode {
  return useMatches({
    select: (matches) => {
      for (const { routeId } of matches) {
        if (routeId === '/_chat/index') return 'index'
        if (routeId === '/_chat/notes' || routeId === '/_chat/notes/$documentId')
          return 'notes'
        if (routeId === '/_chat/pages' || routeId === '/_chat/pages/$pageId')
          return 'pages'
        if (routeId === '/_chat/vault') return 'vault'
        if (routeId === '/_chat/spaces') return 'spaces'
        if (routeId === '/_chat/canvas') return 'canvas'
        if (routeId === '/_chat/ide') return 'ide'
      }
      return 'chat'
    },
  })
}

/** Navigates to a mode; chat returns to the conversation last left. */
export function useOpenMode() {
  const navigate = useNavigate()
  return useCallback(
    (next: ShellMode) => {
      if (next === 'index') return navigate({ to: '/index' })
      if (next === 'notes') return navigate({ to: '/notes' })
      if (next === 'pages') return navigate({ to: '/pages' })
      if (next === 'vault') return navigate({ to: '/vault' })
      if (next === 'spaces') return navigate({ to: '/spaces' })
      if (next === 'canvas') return navigate({ to: '/canvas' })
      if (next === 'ide') return navigate({ to: '/ide' })
      const threadId = useShell.getState().chatThreadId
      return threadId
        ? navigate({ to: '/c/$threadId', params: { threadId } })
        : navigate({ to: '/' })
    },
    [navigate],
  )
}
/**
 * The view for the current mode. The conversation stays mounted behind the
 * other modes, so its scroll position and composer draft survive a switch.
 * On the desktop the Vault covers the whole sheet, so the dock keeps the
 * conversation laid out beneath it, and the IDE's page has its own
 * conversation beside Theia; on a phone they take the screen.
 */
export function ModeView({ docked = false }: { docked?: boolean }) {
  const mode = useShellMode()
  // A project's home stands in for the conversation, which stays mounted behind it.
  const { projectId } = useParams({ strict: false })
  const projectHome = mode === 'chat' && projectId !== undefined
  const showThread =
    (mode === 'chat' && !projectHome) || (docked && mode === 'vault')
  return (
    <>
      {projectHome && <ProjectHome key={projectId} projectId={projectId} />}
      <div hidden={!showThread} className="h-full">
        <LifeBackdrop>
          <Thread covered={mode !== 'chat'} />
        </LifeBackdrop>
      </div>
      {mode === 'ide' && !docked && <IdeFrame />}
      {mode === 'vault' && !docked && <VaultPhone />}
      {mode === 'index' && <IndexMode />}
      {mode === 'notes' && <NotesView />}
      {mode === 'pages' && <PagesView />}
      {mode === 'spaces' && <Canvas />}
      {mode === 'canvas' && <ProgramSurface />}
    </>
  )
}

/** A mode's page in the Pages route: `mode:index`. */
const MODE_PREFIX = 'mode:'

/** The open page, or a word on how to open one. */
function PagesView() {
  const { pageId } = useParams({ strict: false })
  const mode = pageId?.startsWith(MODE_PREFIX)
    ? pageId.slice(MODE_PREFIX.length)
    : undefined
  if (mode !== undefined)
    return isPageMode(mode) ? (
      <ModePageView key={mode} mode={mode} />
    ) : (
      <PageStatus title="There is no such mode" />
    )
  return pageId ? (
    <PageView key={pageId} entryId={pageId} />
  ) : (
    <PageStatus
      title="Pages"
      detail="A page is modules you arrange and connect. Open one from the list, or make a new one."
    />
  )
}
