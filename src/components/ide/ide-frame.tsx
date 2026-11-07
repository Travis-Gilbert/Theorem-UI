// SOURCING: penpal connect + WindowMessenger (the frame link; contract in ide/theia-extensions/theorem-workspace/src/common/ide-bridge.ts), assistant-ui composer (Add to chat) and thread (the IDE chat's sends and stops), the chat's own approval decision, terminal-screen's runs (what Follow follows when docked), next-themes (the theme the frame follows), the shell's panel state (the rail drives Theia's sidebar)
//
// The IDE is the browser-only Theia build served at /theia on this origin,
// working on the active project's Theorem workspace. Theia owns everything
// inside the sheet, Follow the Agent's switch included; this frame only links
// it to the conversation, the rail and Follow the Agent. Alone, Theia's chat
// shows the conversation this window holds and sends through it, so both
// always show the same turns. Docked, on a page whose agent terminal is the
// conversation, Theia's chat closes, Follow follows the terminal's active tab
// and Add to chat goes only where the page connects it (a terminal's Attach).
import { useAui } from '@assistant-ui/react'
import type { TheoremContextReference } from '@theoremharness/sdk'
import { useTheme } from 'next-themes'
import { connect, WindowMessenger } from 'penpal'
import { useEffect, useEffectEvent, useRef } from 'react'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import {
  approvalChoice,
  sendApprovalDecision,
} from '@/components/chat/theorem-parts'
import { useOpenMode } from '@/components/shell/modes'
import { useActiveProject } from '@/components/shell/projects'
import { useShell } from '@/components/shell/shell-state'
import { useTerminalRuns } from '@/components/terminal/terminal-screen'
import type {
  IdeFrameMethods,
  IdeHostMethods,
} from '../../../ide/theia-extensions/theorem-workspace/src/common/ide-bridge'
import { useChatMirror } from './chat-mirror'
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

/**
 * The IDE. Add to chat reaches `onAddToChat` always and, unless `docked`,
 * Theia's chat composer too.
 */
export function IdeFrame({
  docked = false,
  onAddToChat,
}: {
  docked?: boolean
  onAddToChat?: (reference: TheoremContextReference) => void
}) {
  const { project } = useActiveProject()
  const aui = useAui()
  const openMode = useOpenMode()
  const { resolvedTheme } = useTheme()
  const frame = useRef<HTMLIFrameElement>(null)
  const ide = useFollow((s) => s.ide)
  const following = useFollow((s) => s.following)
  const sidebarOpen = useShell((s) => !s.panelCollapsed.ide)
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

  useEffect(() => {
    const remoteWindow = frame.current?.contentWindow
    if (!src || !remoteWindow) return
    const methods: IdeHostMethods = {
      addToChat: (reference) => {
        added(reference)
        if (docked) return
        const draft = aui.composer.getState().text.trimEnd()
        const text = referenceText(reference)
        aui.composer.setText(draft ? `${draft}\n\n${text}\n` : `${text}\n`)
      },
      navigated: () => useFollow.getState().pause(),
      sidebarChanged: (open) =>
        useShell.setState((s) => ({
          panelCollapsed: { ...s.panelCollapsed, ide: !open },
        })),
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
    }
    const connection = connect<IdeFrameMethods>({
      messenger: new WindowMessenger({ remoteWindow }),
      methods: { ...methods },
    })
    connection.promise.then(
      (remote) => {
        const { pending } = useFollow.getState()
        useFollow.setState({ ide: remote, pending: undefined })
        pending?.(remote)
      },
      () => undefined,
    )
    return () => {
      connection.destroy()
      useFollow.setState({ ide: undefined })
    }
  }, [src, aui, openMode, docked])

  useEffect(() => {
    void ide?.setTheme(resolvedTheme === 'dark')
  }, [ide, resolvedTheme])

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
  useFollowRuns(ide, docked ? terminalRuns : chatRuns)

  if (!src)
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
        Loading the workspace…
      </div>
    )
  return (
    <iframe
      key={src}
      ref={frame}
      src={src}
      title="IDE"
      className="block h-full w-full border-0 bg-background"
    />
  )
}
