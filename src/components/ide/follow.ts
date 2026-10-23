// SOURCING: zustand (follow state, as the artifact view keeps its own), assistant-ui useAuiState (the live run's tool calls), @theoremharness/sdk location types, penpal's RemoteProxy for the IDE frame
//
// Follow the Agent: while a run works, the views beside the conversation go
// where it works. A file it touches opens in the IDE's preview editor without
// taking focus; an artifact it writes opens in its panel. The person moving
// somewhere themselves pauses Follow until they resume it.
import { useAuiState } from '@assistant-ui/react'
import type { TheoremLocation } from '@theoremharness/sdk'
import type { RemoteProxy } from 'penpal'
import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import type { IdeFrameMethods } from '../../../ide/theia-extensions/theorem-workspace/src/common/ide-bridge'

type FollowState = {
  following: boolean
  /** The IDE frame while one is open and linked. */
  ide: RemoteProxy<IdeFrameMethods> | undefined
  pause: () => void
  resume: () => void
}

export const useFollow = create<FollowState>()((set) => ({
  following: true,
  ide: undefined,
  pause: () => set({ following: false }),
  resume: () => set({ following: true }),
}))

/** Shows a place the agent is working on, unless the person paused Follow. */
export function follow(location: TheoremLocation) {
  const { following, ide } = useFollow.getState()
  if (!following) return
  const { resource } = location
  if (resource.kind === 'artifact')
    useArtifactView.getState().open(resource.artifactId)
  else if (resource.kind === 'file')
    void ide?.reveal(location, { preserveFocus: true, preview: true })
}

/** Argument names Theorem's and MCP file tools use for the file and line they act on. */
const PATH_ARGS = ['path', 'file_path', 'filePath', 'file', 'target_file', 'relative_path']
const LINE_ARGS = ['line', 'start_line', 'line_number', 'startLine']

/**
 * The workspace file a tool call names. Absolute paths are left alone: the
 * UI does not know where the host keeps the checkout.
 */
export function toolCallLocation(
  args: Readonly<Record<string, unknown>>,
  workspaceId: string,
): TheoremLocation | undefined {
  const raw = PATH_ARGS.map((name) => args[name]).find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  if (!raw || raw.startsWith('/') || /^[a-z]:[\\/]/i.test(raw)) return undefined
  const path = raw.replace(/^\.\//, '')
  const line = LINE_ARGS.map((name) => args[name]).find(
    (value): value is number => Number.isInteger(value) && (value as number) > 0,
  )
  const resource = { kind: 'file' as const, workspaceId, path }
  if (line === undefined) return { resource }
  const at = { line: line - 1, character: 0 }
  return { resource, range: { start: at, end: at, unit: 'utf16' } }
}

/** Follows the files the live run's tool calls name, each call once. */
export function useFollowAgentFiles(workspaceId: string) {
  const parts = useAuiState((s) => {
    const last = s.thread.messages.at(-1)
    return last?.status?.type === 'running' ? last.content : undefined
  })
  const followed = useRef(new Set<string>())
  useEffect(() => {
    for (const part of parts ?? []) {
      if (part.type !== 'tool-call' || followed.current.has(part.toolCallId))
        continue
      const location = toolCallLocation(part.args, workspaceId)
      if (!location) continue
      followed.current.add(part.toolCallId)
      follow(location)
    }
  }, [parts, workspaceId])
}
