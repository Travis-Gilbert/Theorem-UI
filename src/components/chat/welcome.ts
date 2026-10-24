// SOURCING: @tanstack/react-query (the welcome as server state, keyed by what it was written from; the workspace trees the folder views already cache), assistant-ui thread list state
import { useAuiState } from '@assistant-ui/react'
import { skipToken, useQueries, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useActiveProject } from '@/components/shell/projects'
import type { Welcome, WelcomeRequest } from '@/lib/theorem/welcome-schema'
import {
  useWorkspaces,
  workspaceClient,
  workspaceTreeKey,
} from '@/lib/workspace/workspaces'

const FOLDERS = 3
const FILES = 10

/**
 * The new-chat headline and two suggestions, which Theorem writes from the
 * person's project and recent conversations plus the folders open here. It is
 * asked again when any of those change, not on every visit.
 *
 * Theorem has no welcome endpoint yet (docs/plans/welcome-endpoint.md), so the
 * query stays dormant and the new-chat view shows the composer alone.
 */
export function useWelcome() {
  const threadsLoading = useAuiState((s) => s.threads.isLoading)
  const items = useAuiState((s) => s.threads.threadItems)
  const { project, isPending: projectPending } = useActiveProject()
  const { workspaces, isPending: workspacesPending } = useWorkspaces()
  // Read once per view, so the clock does not keep changing the question.
  const [localTime] = useState(() =>
    new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date()),
  )

  // Theorem reads the threads itself; the newest activity only keys the cache,
  // so a new message asks again.
  const latestActivity = Math.max(
    0,
    ...items
      .filter((item) => item.status === 'regular')
      .map((item) => item.lastMessageAt?.getTime() ?? 0),
  )

  const folders = workspaces.slice(0, FOLDERS)
  const trees = useQueries({
    queries: folders.map((summary) => ({
      queryKey: workspaceTreeKey(summary.id),
      queryFn: () => workspaceClient(summary).tree(),
      staleTime: Infinity,
    })),
  })

  const request: WelcomeRequest = {
    localTime,
    folders: folders.map((summary, index) => ({
      name: summary.name,
      recentFiles: (trees[index]?.data ?? [])
        .filter((entry) => entry.kind === 'file')
        .toSorted((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, FILES)
        .map((entry) => entry.path),
    })),
  }
  const settled =
    !threadsLoading &&
    !projectPending &&
    !workspacesPending &&
    project !== undefined &&
    trees.every((query) => !query.isPending)

  return useQuery<Welcome>({
    queryKey: [
      'theorem',
      'welcome',
      project?.projectId,
      latestActivity,
      request.folders,
    ],
    // The SDK call for POST /api/chat/v1/projects/{project_id}/welcome goes
    // here, with `request` as its body.
    queryFn: skipToken,
    enabled: settled,
    staleTime: 10 * 60_000,
    retry: false,
  })
}
