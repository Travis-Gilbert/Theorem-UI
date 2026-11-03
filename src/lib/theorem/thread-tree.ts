// SOURCING: @tanstack/react-query (per-thread branch state over @theoremharness/sdk threads.get and threads.update; thread origins through threads.create), assistant-ui's thread list (reload, switchToThread) to open a new thread, zustand for the last failure
//
// Two kinds of children nest under a thread in the sidebar. Its branches: the
// root branch is the thread's own row and each fork made by an edit or a
// regenerate is a child. The thread list does not carry branches, so each row
// reads its thread once it is on screen. And the threads a person forked or
// continued from it, which carry the source in `Thread.origin`.
import { useAui } from '@assistant-ui/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { describeError, mutate, mutateThread, theorem } from './client'
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

/** The thread this one was forked or continued from, as its list metadata keeps it. */
export const threadOrigin = (
  custom: Readonly<Record<string, unknown>> | undefined,
) => custom?.origin as Theorem.ThreadOrigin | undefined

/** A message as the chat shows it. One sent this session has a local id, and the run that wrote it. */
export type ForkPoint = { messageId: string; runId?: string }

export type ThreadFrom =
  | { kind: 'forked'; threadId: string; at?: ForkPoint }
  | { kind: 'continued'; threadId: string }

/**
 * The durable message a fork copies through: the one named, on whichever of
 * the thread's branches holds it, or the selected branch's last message.
 */
async function forkOrigin(
  { thread, messages, branches }: Theorem.ThreadSnapshot,
  at: ForkPoint | undefined,
): Promise<Theorem.ThreadOrigin.Forked> {
  const origin = (branchId: string, messageId: string) =>
    ({
      kind: 'forked',
      threadId: thread.threadId,
      branchId,
      messageId,
    }) as const
  if (!at) {
    const last = messages.at(-1)
    if (!last) throw new Error('This thread has no messages to fork.')
    return origin(thread.selectedBranchId, last.messageId)
  }
  const matches = (message: Theorem.Message) =>
    message.messageId === at.messageId ||
    (at.runId !== undefined &&
      message.role === 'assistant' &&
      message.runId === at.runId)
  const found = messages.findLast(matches)
  if (found) return origin(thread.selectedBranchId, found.messageId)
  for (const { branchId } of branches) {
    if (branchId === thread.selectedBranchId) continue
    const branch = await theorem().chat.threads.get({
      threadId: thread.threadId,
      branchId,
    })
    const message = branch.messages.findLast(matches)
    if (message) return origin(branchId, message.messageId)
  }
  throw new Error('That message is not stored yet.')
}

/** The last fork or continuation that failed, for the thread list to show. */
export const useThreadFromFailure = create<{
  failure: string | undefined
  dismiss: () => void
}>()((set) => ({
  failure: undefined,
  dismiss: () => set({ failure: undefined }),
}))

/**
 * Starts a thread from another one and opens it. A fork copies the source's
 * history through a message; a continuation starts empty, with the source
 * available as context. Theorem leaves the source as it was.
 */
export function useStartThreadFrom() {
  const aui = useAui()
  return useMutation({
    mutationFn: async (from: ThreadFrom) => {
      const client = theorem()
      const source = await client.chat.threads.get({ threadId: from.threadId })
      const origin: Theorem.ThreadOrigin =
        from.kind === 'forked'
          ? await forkOrigin(source, from.at)
          : { kind: 'continued', threadId: from.threadId }
      const created = await mutate((headers) =>
        client.chat.threads.create({
          projectId: source.thread.projectId,
          // A fork carries its source's history, so it keeps its name; a
          // continuation is named by its own first turn.
          title:
            from.kind === 'forked'
              ? source.thread.title || undefined
              : undefined,
          origin,
          ...headers,
        }),
      )
      return created.record.threadId
    },
    onSuccess: async (threadId) => {
      useThreadFromFailure.setState({ failure: undefined })
      await aui.threads.reload()
      await aui.threads.switchToThread(threadId)
    },
    onError: (error) =>
      useThreadFromFailure.setState({ failure: describeError(error) }),
  })
}
