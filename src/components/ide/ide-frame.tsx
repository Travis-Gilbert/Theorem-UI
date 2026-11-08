// SOURCING: penpal connect + WindowMessenger (the frame link; contract in ide/theia-extensions/theorem-workspace/src/common/ide-bridge.ts), assistant-ui composer (Add to chat) and thread (the IDE chat's sends and stops), the chat's own approval decision, terminal-screen's runs (what Follow follows when docked beside the terminal), the UI's live tokens (ide-theme.ts: the palette and mode the frame follows), the shell's ideFilesOpen (Theia's own side panel, kept across reloads)
//
// The IDE is the browser-only Theia build served at /theia on this origin,
// working on the active project's Theorem workspace. Theia owns everything
// inside the sheet, Follow the Agent's switch included; this frame only links
// it to the conversation, the rail and Follow the Agent. Alone, Theia's chat
// shows the conversation this window holds and sends through it, so both
// always show the same turns. Docked, on a page that has the conversation or
// the agent terminal beside it, Theia's chat closes, Follow follows that
// conversation's runs or the terminal's active tab, and Add to chat goes only
// where the page connects it (the conversation's or a terminal's Attach).
import { useAui } from '@assistant-ui/react'
import type { TheoremContextReference } from '@theoremharness/sdk'
import { connect, WindowMessenger } from 'penpal'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import { ErrorState } from '@/components/assistant-ui/elements/error-state'
import {
  approvalChoice,
  sendApprovalDecision,
} from '@/components/chat/theorem-parts'
import { useOpenMode } from '@/components/shell/modes'
import { useActiveProject } from '@/components/shell/projects'
import { useShell } from '@/components/shell/shell-state'
import { useTerminalRuns } from '@/components/terminal/terminal-screen'
import type {
  IdeConnection,
  IdeFrameMethods,
  IdeHostMethods,
} from '../../../ide/theia-extensions/theorem-workspace/src/common/ide-bridge'
import { useChatMirror } from './chat-mirror'
import { useIdeTheme } from './ide-theme'
import {
  useChatRuns,
  useFollow,
  useFollowRuns,
  workspaceIdOf,
} from './follow'

/** A reference as composer text: its label, then the excerpt fenced. */
function referenceText({ label, excerpt, location }: TheoremContextReference) {
  const name =
    label ??
    (location.resource.kind === 'file' ? location.resource.path : 'Reference')
  return excerpt ? `${name}\n\`\`\`\n${excerpt}\n\`\`\`` : `\`${name}\``
}

/** How long the frame may take to link before the IDE says it has not started. */
const START_WAIT_MS = 45_000

/** One load of the frame: whether it linked, is slow, and how its workspace attachment stands. */
interface FrameLoad {
  frame: string
  linked?: boolean
  slow?: boolean
  connection?: IdeConnection
}

/** The record for this load, or a fresh one when the last record is another load's. */
const forFrame = (load: FrameLoad | undefined, frame: string): FrameLoad =>
  load?.frame === frame ? load : { frame }

/**
 * The IDE. Add to chat reaches `onAddToChat` always and, unless `docked`,
 * Theia's chat composer too. Follow follows the conversation's runs, or with
 * `follows` set to the terminal, the agent terminal's active tab.
 */
export function IdeFrame({
  docked = false,
  follows = 'chat',
  onAddToChat,
}: {
  docked?: boolean
  follows?: 'chat' | 'terminal'
  onAddToChat?: (reference: TheoremContextReference) => void
}) {
  const { project } = useActiveProject()
  const aui = useAui()
  const openMode = useOpenMode()
  const look = useIdeTheme()
  const frame = useRef<HTMLIFrameElement>(null)
  const ide = useFollow((s) => s.ide)
  const following = useFollow((s) => s.following)
  const sidebarOpen = useShell((s) => s.ideFilesOpen)
  const activeTab = useShell((s) =>
    project ? s.terminalTabs[project.projectId]?.active : undefined,
  )
  const added = useEffectEvent((reference: TheoremContextReference) =>
    onAddToChat?.(reference),
  )
  const workspaceId = project && workspaceIdOf(project.projectId)
  const src = workspaceId
    ? `/theia/?${new URLSearchParams({ workspace: workspaceId, name: project.title })}`
    : undefined
  /** Loads the frame again when it never linked. */
  const [reloads, setReloads] = useState(0)
  const frameKey = src && `${src}#${reloads}`
  /** What this load of the frame has done; a new load starts from nothing. */
  const [load, setLoad] = useState<FrameLoad>()
  const thisLoad: Partial<FrameLoad> =
    load && load.frame === frameKey ? load : {}
  const { linked = false, slow = false, connection } = thisLoad

  useEffect(() => {
    if (!frameKey) return
    const timer = setTimeout(
      () => setLoad((current) => ({ ...forFrame(current, frameKey), slow: true })),
      START_WAIT_MS,
    )
    return () => clearTimeout(timer)
  }, [frameKey])

  useEffect(() => {
    const remoteWindow = frame.current?.contentWindow
    if (!frameKey || !remoteWindow) return
    const methods: IdeHostMethods = {
      addToChat: (reference) => {
        added(reference)
        if (docked) return
        const draft = aui.composer.getState().text.trimEnd()
        const text = referenceText(reference)
        aui.composer.setText(draft ? `${draft}\n\n${text}\n` : `${text}\n`)
      },
      navigated: () => useFollow.getState().pause(),
      sidebarChanged: (open) => useShell.getState().setIdeFilesOpen(open),
      setFollowing: (next) =>
        next ? useFollow.getState().resume() : useFollow.getState().pause(),
      send: async (text) => {
        aui.thread.append(text)
        return (await aui.threadListItem.initialize()).remoteId
      },
      cancel: () => aui.thread.cancelRun(),
      decideApproval: async ({ approval, allow }) => {
        const choice = approvalChoice(approval.options, allow)
        if (!choice) return false
        try {
          await sendApprovalDecision(approval.runId, approval, choice)
          return true
        } catch {
          return false
        }
      },
      openThread: (threadId) =>
        useShell.getState().setChatThreadId(threadId ?? undefined),
      // The dock stays mounted under the IDE, so the artifact is open when chat shows.
      openArtifact: (artifactId) => {
        useArtifactView.getState().open(artifactId)
        void openMode('chat')
      },
      // A failure's error stays while it tries again.
      connectionChanged: (next) =>
        setLoad((current) => {
          const previous = forFrame(current, frameKey)
          const error = previous.connection?.error
          return {
            ...previous,
            connection:
              next.workspace === 'opening' && error ? { ...next, error } : next,
          }
        }),
    }
    const link = connect<IdeFrameMethods>({
      messenger: new WindowMessenger({ remoteWindow }),
      methods: { ...methods },
    })
    link.promise.then(
      (remote) => {
        setLoad((current) => ({ ...forFrame(current, frameKey), linked: true }))
        const { pending } = useFollow.getState()
        useFollow.setState({ ide: remote, pending: undefined })
        pending?.(remote)
      },
      // Destroyed by the cleanup below; a frame that never links shows as not started.
      () => undefined,
    )
    return () => {
      link.destroy()
      useFollow.setState({ ide: undefined })
    }
  }, [frameKey, aui, openMode, docked])

  useEffect(() => {
    if (look) void ide?.setTheme(look)
  }, [ide, look])

  useEffect(() => {
    void ide?.setSidebar(sidebarOpen)
  }, [ide, sidebarOpen])

  useEffect(() => {
    void ide?.setFollowing(following)
  }, [ide, following])

  // A frame built before closeChatView rejects it; its chat then stays open.
  useEffect(() => {
    if (docked) ide?.closeChatView().catch(() => undefined)
  }, [ide, docked])

  const chatRuns = useChatRuns()
  const terminalRuns = useTerminalRuns(activeTab)
  useChatMirror(docked ? undefined : ide)
  useFollowRuns(ide, follows === 'terminal' ? terminalRuns : chatRuns)

  if (!src)
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
        Loading the workspace…
      </div>
    )
  /** Why the workspace did not open, while it has not. */
  const failure =
    connection?.workspace === 'open'
      ? undefined
      : connection?.error?.replace(/\.$/, '')
  return (
    <div className="relative h-full w-full">
      <iframe
        key={frameKey}
        ref={frame}
        src={src}
        title="IDE"
        className="block h-full w-full border-0 bg-background"
      />
      {failure || (slow && !linked) ? (
        <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center px-4">
          {failure ? (
            <ErrorState
              className="shadow-sheet pointer-events-auto max-w-md"
              title="The workspace did not open"
              detail={`${failure}. Trying again${connection?.retryInMs ? ` in ${Math.round(connection.retryInMs / 1000)} s` : ''}.`}
              retrying={connection?.workspace === 'opening'}
              onRetry={() => ide?.retryConnection()}
            />
          ) : (
            <ErrorState
              className="shadow-sheet pointer-events-auto max-w-md"
              title="The IDE has not started"
              detail="It is taking longer than usual to load."
              retrying={false}
              onRetry={() => setReloads((count) => count + 1)}
            />
          )}
        </div>
      ) : null}
    </div>
  )
}
