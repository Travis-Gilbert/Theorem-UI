// SOURCING: @tanstack/react-router file routes (a pathless layout owns the assistant runtime; child routes only carry the thread id or the mode)
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
} from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import { ChatShell, ShellStatus } from '@/components/shell/chat-shell'
import { useShellMode } from '@/components/shell/modes'
import { useActiveProject } from '@/components/shell/projects'
import { useShell } from '@/components/shell/shell-state'
import { describeError } from '@/lib/theorem/client'
import { TheoremRuntimeProvider } from '@/lib/theorem/runtime'

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

  const onThreadIdChange = useCallback(
    (id: string | undefined) => {
      if (id) void navigate({ to: '/c/$threadId', params: { threadId: id } })
      else void navigate({ to: '/' })
    },
    [navigate],
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
      key={project.projectId}
      projectId={project.projectId}
      threadId={openThreadId}
      onThreadIdChange={onThreadIdChange}
    >
      <ChatShell projectId={project.projectId} threadId={openThreadId} />
      <Outlet />
    </TheoremRuntimeProvider>
  )
}
