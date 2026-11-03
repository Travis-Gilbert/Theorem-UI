// SOURCING: zustand (follow state, as the artifact view keeps its own), assistant-ui useAuiState (the working turn's run and its delegations), penpal's RemoteProxy for the IDE frame, @tanstack/react-router useNavigate (to the IDE for a delegation's changes); the frame matches these runs to the workspace's document events
//
// Follow the Agent: while a turn works, the views beside the conversation go
// where it works. Every edit the document authority accepts names the run that
// made it, so the IDE frame shows the edits of the turn's run and of the
// delegations it started, in its preview editor without taking focus; an
// artifact the turn writes opens in its panel. The person moving somewhere
// themselves pauses Follow until they resume it.
import { useAuiState } from '@assistant-ui/react'
import { useNavigate } from '@tanstack/react-router'
import type { RemoteProxy } from 'penpal'
import { useEffect } from 'react'
import { create } from 'zustand'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import { DELEGATION_PART, readDelegation } from '@/lib/theorem/delegations'
import type {
  DelegationChanges,
  IdeFrameMethods,
} from '../../../ide/theia-extensions/theorem-workspace/src/common/ide-bridge'

type FollowState = {
  following: boolean
  /** The IDE frame while one is open and linked. */
  ide: RemoteProxy<IdeFrameMethods> | undefined
  /** Changes asked for before the IDE frame linked; it opens them once it does. */
  pendingChanges: DelegationChanges | undefined
  pause: () => void
  resume: () => void
}

export const useFollow = create<FollowState>()((set) => ({
  following: true,
  ide: undefined,
  pendingChanges: undefined,
  pause: () => set({ following: false }),
  resume: () => set({ following: true }),
}))

/** Opens an artifact the working turn wrote, unless the person paused Follow. */
export function followArtifact(artifactId: string) {
  if (useFollow.getState().following)
    useArtifactView.getState().open(artifactId)
}

/**
 * Opens a delegation's changes in the IDE. The person asked for them, so this
 * goes to the IDE whether or not Follow the Agent is on.
 */
export function useOpenChanges() {
  const navigate = useNavigate()
  return (target: DelegationChanges) => {
    const { ide } = useFollow.getState()
    if (ide) void ide.openChanges(target)
    else useFollow.setState({ pendingChanges: target })
    void navigate({ to: '/ide' })
  }
}

/**
 * Tells the IDE frame whose edits to follow: the working turn's run and the
 * runs of the delegations it started. The ids travel joined, so the selected
 * value compares by content.
 */
export function useFollowRuns(ide: RemoteProxy<IdeFrameMethods> | undefined) {
  const runs = useAuiState((s) => {
    const last = s.thread.messages.at(-1)
    const working =
      last?.status?.type === 'running' ||
      last?.status?.type === 'requires-action'
    if (!last || !working) return ''
    return [
      last.metadata.custom.theoremRunId,
      ...last.content.map((part) =>
        part.type === 'data' && part.name === DELEGATION_PART
          ? readDelegation(part.data)?.childRunId
          : undefined,
      ),
    ]
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .join(' ')
  })
  useEffect(() => {
    void ide?.setFollowedRuns(runs ? runs.split(' ') : [])
  }, [ide, runs])
}
