// SOURCING: penpal connect + WindowMessenger (the frame link; contract in ide/theia-extensions/theorem-workspace/src/common/ide-bridge.ts), assistant-ui composer (Add to chat), next-themes (the theme the frame follows), ui/button
//
// The IDE is the browser-only Theia build served at /theia on this origin,
// working on the active project's Theorem workspace. Theia owns the editors;
// this frame only links it to the conversation and to Follow the Agent.
import { useAui } from '@assistant-ui/react'
import type { TheoremContextReference } from '@theoremharness/sdk'
import { useTheme } from 'next-themes'
import { connect, WindowMessenger } from 'penpal'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useActiveProject } from '@/components/shell/projects'
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

function FollowBar() {
  const following = useFollow((s) => s.following)
  const ide = useFollow((s) => s.ide)
  const selection = useFollow((s) => s.selection)
  const { pause, resume } = useFollow.getState()
  const path =
    selection?.resource.kind === 'file' ? selection.resource.path : undefined
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-separator px-2 text-sm text-ink-muted">
      <span className="min-w-0 flex-1 truncate">
        {following ? 'Following the agent' : 'Follow paused'}
        {path && <span className="text-ink-faint"> · {path}</span>}
      </span>
      {path && ide && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void ide.executeCommand('theorem.addToChat')}
        >
          Add to chat
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={following}
        onClick={following ? pause : resume}
      >
        {following ? 'Pause' : 'Follow the agent'}
      </Button>
    </div>
  )
}

export function IdeFrame() {
  const { project } = useActiveProject()
  const aui = useAui()
  const { resolvedTheme } = useTheme()
  const frame = useRef<HTMLIFrameElement>(null)
  const ide = useFollow((s) => s.ide)
  const workspaceId = project && workspaceIdOf(project.projectId)
  const src = workspaceId
    ? `/theia/?${new URLSearchParams({ workspace: workspaceId, name: project.title })}`
    : undefined

  useEffect(() => {
    const remoteWindow = frame.current?.contentWindow
    if (!src || !remoteWindow) return
    const methods: IdeHostMethods = {
      selectionChanged: (selection) => useFollow.setState({ selection }),
      addToChat: (reference) => {
        const draft = aui.composer.getState().text.trimEnd()
        const text = referenceText(reference)
        aui.composer.setText(draft ? `${draft}\n\n${text}\n` : `${text}\n`)
      },
      navigated: () => useFollow.getState().pause(),
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
      useFollow.setState({ ide: undefined, selection: undefined })
    }
  }, [src, aui])

  useEffect(() => {
    void ide?.setTheme(resolvedTheme === 'dark')
  }, [ide, resolvedTheme])

  useFollowAgentFiles(workspaceId ?? '')

  if (!src)
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
        Loading the workspace…
      </div>
    )
  return (
    <div className="flex h-full flex-col bg-background">
      <FollowBar />
      <iframe
        key={src}
        ref={frame}
        src={src}
        title="IDE"
        className="min-h-0 w-full flex-1 border-0"
      />
    </div>
  )
}
