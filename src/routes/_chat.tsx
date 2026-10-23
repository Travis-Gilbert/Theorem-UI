// SOURCING: @tanstack/react-router file routes (a pathless layout owns the assistant runtime; child routes only carry the thread id or the mode), ui/button's variants for the sign-in link
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
import { buttonVariants } from '@/components/ui/button'
import { describeError, isSignedOut } from '@/lib/theorem/client'
import { signInHref } from '@/lib/theorem/sign-in'
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

  if (isSignedOut(error)) return <SignIn />
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

/** Shown while nobody is signed in; a failed attempt comes back with its reason. */
function SignIn() {
  const failure = new URLSearchParams(window.location.search).get(
    'signin_error',
  )
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p className="font-heading text-[20px] font-normal tracking-tight">
        Theorem
      </p>
      <p className="max-w-md text-sm text-ink-muted">
        {failure
          ? `Signing in did not finish (${failure}). Try again.`
          : 'Sign in to open your projects and conversations.'}
      </p>
      <a href={signInHref()} className={buttonVariants()}>
        Sign in
      </a>
    </div>
  )
}
