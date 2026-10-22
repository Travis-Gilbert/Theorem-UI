// SOURCING: @tanstack/react-query (per-thread branch state over @theoremharness/sdk threads.get and threads.update)
//
// Theorem has no parent link between threads yet, so the sidebar nests a
// thread's branches under it instead: the root branch is the thread's own row
// and each fork made by an edit or a regenerate is a child. The thread list
// does not carry branches, so each row reads its thread once it is on screen.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mutateThread, theorem } from './client'
import type { Theorem } from './client'

export type ThreadTree = {
  rootBranchId: string
  /** Every branch but the root, oldest first. */
  forks: Theorem.Branch[]
  selectedBranchId: string
  /** A run in progress on the authority, which may belong to another tab or device. */
  activeRunId: string | null
  lastRunOutcome: Theorem.RunEnding | undefined
}

export const threadTreeKey = (threadId: string) =>
  ['theorem', 'thread-tree', threadId] as const

export function useThreadTree(threadId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: threadTreeKey(threadId ?? ''),
    enabled: enabled && threadId !== undefined,
    queryFn: async (): Promise<ThreadTree | null> => {
      const { thread, branches } = await theorem().chat.threads.get({
        threadId: threadId!,
      })
      const root = branches.find((branch) => !branch.parentBranchId)
      if (!root) return null
      return {
        rootBranchId: root.branchId,
        forks: branches
          .filter((branch) => branch !== root)
          .sort((a, b) => a.createdAtMs - b.createdAtMs),
        selectedBranchId: thread.selectedBranchId,
        activeRunId: thread.activeRunId,
        lastRunOutcome: thread.lastRun?.outcome,
      }
    },
    staleTime: 5 * 60_000,
    // A run this tab is not streaming ends without telling it; poll until it does.
    refetchInterval: (query) => (query.state.data?.activeRunId ? 5_000 : false),
  })
}

function textOf(message: Theorem.Message) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part.payload as { text?: unknown } | undefined)?.text)
    .filter((text) => typeof text === 'string')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A fork's first own message: the edited prompt, or the regenerated reply. */
export function useBranchLabel(threadId: string, branchId: string) {
  return useQuery({
    queryKey: ['theorem', 'branch-label', threadId, branchId],
    queryFn: async () => {
      const { messages } = await theorem().chat.threads.get({
        threadId,
        branchId,
      })
      const first = messages.find(
        (message) => message.originBranchId === branchId,
      )
      return first ? textOf(first) : ''
    },
    // A branch's first message never changes.
    staleTime: Infinity,
  }).data
}

/** Makes a branch the thread's selected one, which is what its history loads. */
export function useSelectBranch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      threadId,
      branchId,
    }: {
      threadId: string
      branchId: string
    }) =>
      mutateThread(threadId, (headers) =>
        theorem().chat.threads.update({
          threadId,
          selectedBranchId: branchId,
          ...headers,
        }),
      ),
    onMutate: ({ threadId, branchId }) => {
      const key = threadTreeKey(threadId)
      const previous = queryClient.getQueryData<ThreadTree | null>(key)
      if (previous)
        queryClient.setQueryData(key, {
          ...previous,
          selectedBranchId: branchId,
        })
      return { previous }
    },
    onError: (_error, { threadId }, context) => {
      if (context?.previous)
        queryClient.setQueryData(threadTreeKey(threadId), context.previous)
    },
    onSettled: (_data, _error, { threadId }) =>
      queryClient.invalidateQueries({ queryKey: threadTreeKey(threadId) }),
  })
}
