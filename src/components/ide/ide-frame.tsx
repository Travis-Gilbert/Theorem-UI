// SOURCING: penpal connect + WindowMessenger (the frame link; contract in ide/theia-extensions/theorem-workspace/src/common/ide-bridge.ts), assistant-ui composer (Add to chat), next-themes (the theme the frame follows), the shell's panel state (the rail drives Theia's sidebar)
//
// The IDE is the browser-only Theia build served at /theia on this origin,
// working on the active project's Theorem workspace. Theia owns everything
// inside the sheet, Follow the Agent's switch included; this frame only links
// it to the conversation, the rail and Follow the Agent.
import { useAui } from '@assistant-ui/react'
import type { TheoremContextReference } from '@theoremharness/sdk'
import { useTheme } from 'next-themes'
import { connect, WindowMessenger } from 'penpal'
import { useEffect, useRef } from 'react'
import { useActiveProject } from '@/components/shell/projects'
import { useShell } from '@/components/shell/shell-state'
import type {
  IdeFrameMethods,
  IdeHostMethods,
} from '../../../ide/theia-extensions/theorem-workspace/src/common/ide-bridge'
import { useFollow, useFollowAgentFiles } from './follow'

/**
 * The project's workspace on the host. Host workspace ids are directory names
 * of ASCII letters, digits, `_` and `-`; project ids carry a `:`.
 */
const workspaceIdOf = (projectId: string) =>
  projectId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80)

/** A reference as composer text: its label, then the excerpt fenced. */
function referenceText({ label, excerpt, location }: TheoremContextReference) {
  const name =
    label ??
    (location.resource.kind === 'file' ? location.resource.path : 'Reference')
  return excerpt ? `${name}\n\`\`\`\n${excerpt}\n\`\`\`` : `\`${name}\``
}

export function IdeFrame() {
  const { project } = useActiveProject()
  const aui = useAui()
  const { resolvedTheme } = useTheme()
  const frame = useRef<HTMLIFrameElement>(null)
  const ide = useFollow((s) => s.ide)
  const following = useFollow((s) => s.following)
  const sidebarOpen = useShell((s) => !s.panelCollapsed.ide)
  const workspaceId = project && workspaceIdOf(project.projectId)
  const src = workspaceId
    ? `/theia/?${new URLSearchParams({ workspace: workspaceId, name: project.title })}`
    : undefined

  useEffect(() => {
    const remoteWindow = frame.current?.contentWindow
    if (!src || !remoteWindow) return
    const methods: IdeHostMethods = {
      addToChat: (reference) => {
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
    }
    const connection = connect<IdeFrameMethods>({
      messenger: new WindowMessenger({ remoteWindow }),
      methods: { ...methods },
    })
    connection.promise.then(
      (remote) => useFollow.setState({ ide: remote }),
      () => undefined,
    )
    return () => {
      connection.destroy()
      useFollow.setState({ ide: undefined })
    }
  }, [src, aui])

  useEffect(() => {
    void ide?.setTheme(resolvedTheme === 'dark')
  }, [ide, resolvedTheme])

  useEffect(() => {
    void ide?.setSidebar(sidebarOpen)
  }, [ide, sidebarOpen])

  useEffect(() => {
    void ide?.setFollowing(following)
  }, [ide, following])

  useFollowAgentFiles(workspaceId ?? '')

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
