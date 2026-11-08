// SOURCING: @tanstack/react-router file routes (a pathless layout owns the assistant runtime; child routes only carry the thread id or the mode), ui/button's variants for the sign-in link, the ⌘K palette and the model preferences sync mounted with the shell, lib/theorem/organization for the project a thread belongs to
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
} from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import { ChatShell, ShellStatus } from '@/components/shell/chat-shell'
import { CommandPalette } from '@/components/shell/command-palette'
import { useShellMode } from '@/components/shell/modes'
import { useActiveProject } from '@/components/shell/projects'
import { useShell } from '@/components/shell/shell-state'
import { describeError, isSignedOut } from '@/lib/theorem/client'
import { primaryProjectId, useOrganization } from '@/lib/theorem/organization'
import { PreferencesSync } from '@/lib/theorem/models'
import { TheoremRuntimeProvider } from '@/lib/theorem/runtime'

import { SignIn } from '@/components/auth/sign-in'

export const Route = createFileRoute('/_chat')({
  // The runtime, the CSRF bootstrap and the thread list all live in the browser.
  ssr: false,
  component: ChatLayout,
})

function ChatLayout() {
  const { threadId } = useParams({ strict: false })
  const navigate = useNavigate()
  const { project, error } = useActiveProject()

  // Spaces and the IDE keep the last conversation open behind them.
  const mode = useShellMode()
  const chatThreadId = useShell((s) => s.chatThreadId)
  const openThreadId = mode === 'chat' ? threadId : chatThreadId
  useEffect(() => {
    if (mode === 'chat') useShell.getState().setChatThreadId(threadId)
  }, [mode, threadId])

  // A thread opens in the project it belongs to, wherever it was reached from.
  const { data: organization } = useOrganization()
  const openThread = organization?.threads.find(
    (thread) => thread.threadId === openThreadId,
  )
  const homeOfThread = openThread && primaryProjectId(openThread)
  useEffect(() => {
    if (homeOfThread) useShell.getState().setProjectId(homeOfThread)
  }, [openThreadId, homeOfThread])

  // Outside chat the mode stays on screen and only the conversation behind it moves.
  const onThreadIdChange = useCallback(
    (id: string | undefined) => {
      if (mode !== 'chat') useShell.getState().setChatThreadId(id)
      else if (id)
        void navigate({ to: '/c/$threadId', params: { threadId: id } })
      else void navigate({ to: '/' })
    },
    [navigate, mode],
  )

  if (isSignedOut(error))
    return (
      <SignIn
        failure={
          new URLSearchParams(window.location.search).get('signin_error') ??
          undefined
        }
        returnTo={window.location.pathname + window.location.search}
      />
    )
  if (error)
    return (
      <ShellStatus
        title="Theorem is unreachable"
        detail={describeError(error)}
      />
    )
  if (!project) return <ShellStatus title="Theorem" />

  return (
    <TheoremRuntimeProvider
      projectId={project.projectId}
      threadId={openThreadId}
      onThreadIdChange={onThreadIdChange}
    >
      <ChatShell projectId={project.projectId} threadId={openThreadId} />
      <CommandPalette />
      <PreferencesSync />
      <Outlet />
    </TheoremRuntimeProvider>
  )
}
