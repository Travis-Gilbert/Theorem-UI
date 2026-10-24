// SOURCING: @tanstack/react-query (the welcome as server state, keyed by what it was written from; the workspace trees the folder views already cache), assistant-ui thread list state, @theoremharness/sdk thread snapshots
import { useAuiState } from '@assistant-ui/react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useActiveProject } from '@/components/shell/projects'
import { theorem } from '@/lib/theorem/client'
import { Welcome } from '@/lib/theorem/welcome-schema'
import type { WelcomeContext } from '@/lib/theorem/welcome-schema'
import {
  useWorkspaces,
  workspaceClient,
  workspaceTreeKey,
} from '@/lib/workspace/workspaces'

const THREADS = 8
/** How many of the newest threads lend their last ask. */
const ASKS = 3
const FOLDERS = 3
const FILES = 10

/** The last thing the person said in a thread, from its durable snapshot. */
async function lastAsk(threadId: string): Promise<string | undefined> {
  const { messages } = await theorem().chat.threads.get({ threadId })
  const ask = messages.findLast((message) => message.role === 'user')
  const text = ask?.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part.payload as { text?: string } | undefined)?.text ?? '')
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
  return text ? text.slice(0, 600) : undefined
}

/**
 * The new-chat headline and two suggestions, written by the welcome route
 * from the person's recent threads, project and open folders. It is asked
 * again when any of those change, not on every visit.
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

  const recent = items
    .filter((item) => item.status === 'regular' && item.remoteId)
    .toSorted(
      (a, b) =>
        (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0),
    )
    .slice(0, THREADS)

  const asks = useQueries({
    queries: recent.slice(0, ASKS).map((item) => ({
      queryKey: [
        'theorem',
        'welcome',
        'last-ask',
        item.remoteId,
        item.lastMessageAt?.getTime(),
      ],
      queryFn: () => lastAsk(item.remoteId!),
      staleTime: Infinity,
      retry: false,
    })),
  })

  const folders = workspaces.slice(0, FOLDERS)
  const trees = useQueries({
    queries: folders.map((summary) => ({
      queryKey: workspaceTreeKey(summary.id),
      queryFn: () => workspaceClient(summary).tree(),
      staleTime: Infinity,
    })),
  })

  const context: Omit<WelcomeContext, 'localTime'> = {
    project: project?.title,
    threads: recent.map((item, index) => ({
      title: item.title || 'New Chat',
      lastMessageAt: item.lastMessageAt?.toISOString(),
      lastAsk: asks[index]?.data,
    })),
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
    asks.every((query) => !query.isPending) &&
    trees.every((query) => !query.isPending)

  return useQuery({
    queryKey: ['theorem', 'welcome', context],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/welcome', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...context, localTime }),
        signal,
      })
      if (!response.ok) throw new Error(`welcome ${response.status}`)
      return Welcome.parse(await response.json())
    },
    enabled: settled,
    staleTime: 10 * 60_000,
    retry: false,
  })
}
