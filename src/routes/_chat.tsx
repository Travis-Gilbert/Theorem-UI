// SOURCING: @tanstack/react-router file routes (a pathless layout owns the assistant runtime; child routes only carry the thread id)
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
} from '@tanstack/react-router'
import { useCallback } from 'react'
import { ChatShell, ShellStatus } from '@/components/shell/chat-shell'
import { useActiveProject } from '@/components/shell/projects'
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
      threadId={threadId}
      onThreadIdChange={onThreadIdChange}
    >
      <ChatShell />
      <Outlet />
    </TheoremRuntimeProvider>
  )
}
