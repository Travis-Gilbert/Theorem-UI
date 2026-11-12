// SOURCING: zustand (follow state, as the artifact view keeps its own), assistant-ui useAuiState (the working turn's run and its delegations), penpal's RemoteProxy for the IDE frame, @tanstack/react-router useNavigate (to the IDE for a delegation's changes or a file the agent worked on), the shell's active project (whose workspace the IDE shows); the frame matches these runs to the workspace's document events
//
// Follow the Agent: while a turn works, the views beside the conversation go
// where it works. Every edit the document authority accepts names the run that
// made it, so the IDE frame shows the edits of the turn's run and of the
// delegations it started, in its preview editor without taking focus; an
// artifact the turn writes opens in its panel. The person moving somewhere
// themselves pauses Follow until they resume it.
import { useAuiState } from '@assistant-ui/react'
import type { ThreadMessage } from '@assistant-ui/react'
import type { TheoremLocation } from '@theoremharness/sdk'
import { useNavigate } from '@tanstack/react-router'
import type { RemoteProxy } from 'penpal'
import { useEffect } from 'react'
import { create } from 'zustand'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import { useActiveProject } from '@/components/shell/projects'
import { DELEGATION_PART, readDelegation } from '@/lib/theorem/delegations'
import type {
  DelegationChanges,
  IdeFrameMethods,
} from '../../../ide/theia-extensions/theorem-workspace/src/common/ide-bridge'

type Ide = RemoteProxy<IdeFrameMethods>

type FollowState = {
  following: boolean
  /** The IDE frame while one is open and linked. */
  ide: Ide | undefined
  /** The workspace that linked frame opened. */
  ideWorkspace: string | undefined
  /** What was asked of the IDE before its frame linked; it runs once it does. */
  pending: ((ide: Ide) => void) | undefined
  pause: () => void
  resume: () => void
}

export const useFollow = create<FollowState>()((set) => ({
  following: true,
  ide: undefined,
  ideWorkspace: undefined,
  pending: undefined,
  pause: () => set({ following: false }),
  resume: () => set({ following: true }),
}))

/** Opens an artifact the working turn wrote, unless the person paused Follow. */
export function followArtifact(artifactId: string) {
  if (useFollow.getState().following)
    useArtifactView.getState().open(artifactId)
}

/**
 * The project's workspace on the host. Host workspace ids are directory names
 * of ASCII letters, digits, `_` and `-`; project ids carry a `:`.
 */
export const workspaceIdOf = (projectId: string) =>
  projectId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80)

/** Runs `use` on the IDE, going there first; a frame not linked yet runs it once it links. */
function useInIde() {
  const navigate = useNavigate()
  return (use: (ide: Ide) => void) => {
    const { ide } = useFollow.getState()
    if (ide) use(ide)
    else useFollow.setState({ pending: use })
    void navigate({ to: '/ide' })
  }
}

/**
 * Opens a delegation's changes in the IDE. The person asked for them, so this
 * goes to the IDE whether or not Follow the Agent is on.
 */
export function useOpenChanges() {
  const inIde = useInIde()
  return (target: DelegationChanges) =>
    inIde((ide) => void ide.openChanges(target))
}

/**
 * Opens a file of the active project's workspace in the IDE's editor, its
 * lines (one-based, both ends included) selected. The person asked for it,
 * so it goes there with Follow paused or not.
 */
export function useRevealFile() {
  const inIde = useInIde()
  const { project } = useActiveProject()
  return (path: string, start?: number, end?: number) => {
    if (!project) return
    const location: TheoremLocation = {
      resource: {
        kind: 'file',
        workspaceId: workspaceIdOf(project.projectId),
        path,
      },
      ...(start !== undefined && {
        range: {
          start: { line: start - 1, character: 0 },
          end: { line: end ?? start, character: 0 },
          unit: 'utf16',
        },
      }),
    }
    inIde((ide) => void ide.reveal(location, { preview: true }))
  }
}

/**
 * The runs a working turn's edits come from: its own and those of the
 * delegations it started. They travel joined, so a selected value compares
 * by content; empty while no turn works.
 */
export function workingRuns(messages: readonly ThreadMessage[]): string {
  const last = messages.at(-1)
  const working =
    last?.status?.type === 'running' ||
    last?.status?.type === 'requires-action'
  if (!last || !working) return ''
  const runId = (last.metadata.custom as { theoremRunId?: unknown })
    .theoremRunId
  return [
    runId,
    ...last.content.map((part) =>
      part.type === 'data' && part.name === DELEGATION_PART
        ? readDelegation(part.data)?.childRunId
        : undefined,
    ),
  ]
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .join(' ')
}

/** The conversation's working runs, as `workingRuns` joins them. */
export const useChatRuns = () =>
  useAuiState((s) => workingRuns(s.thread.messages))

/** Tells the IDE frame whose edits to follow, from runs as `workingRuns` joins them. */
export function useFollowRuns(ide: Ide | undefined, runs: string) {
  useEffect(() => {
    void ide?.setFollowedRuns(runs ? runs.split(' ') : [])
  }, [ide, runs])
}
