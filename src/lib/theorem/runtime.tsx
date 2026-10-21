// SOURCING: @assistant-ui/react (useRemoteThreadListRuntime + useLocalRuntime) with @theoremharness/sdk/assistant-ui (createTheoremChatAdapter, toAssistantMessages)
//
// Theorem owns durable history, execution and approvals. assistant-ui owns the
// view state. The thread list maps onto Theorem threads in the active project;
// per-thread history is the selected branch from threads.get; turns run through
// the SDK adapter. Hand-written: live-run resume, which the SDK does not provide
// (it reuses the SDK's part mapping via toAssistantMessages), and titling a new
// thread in sequence with its revision-checked first send.
import {
  AssistantRuntimeProvider,
  AuiConfig,
  ExportedMessageRepository,
  Suggestions,
  useAui,
  useLocalRuntime,
  useRemoteThreadListRuntime,
} from '@assistant-ui/react'
import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  RemoteThreadListAdapter,
  ThreadAssistantMessagePart,
  ThreadHistoryAdapter,
} from '@assistant-ui/react'
import { TheoremError } from '@theoremharness/sdk'
import {
  createTheoremChatAdapter,
  toAssistantMessages,
} from '@theoremharness/sdk/assistant-ui'
import { createAssistantStream } from 'assistant-stream'
import { useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { TheoremPartRenderers } from '@/components/chat/theorem-parts'
import { describeError, mutate, mutateThread, theorem } from './client'
import type { Theorem } from './client'

const TERMINAL = new Set(['RUN.CLOSED', 'RUN.FAILED', 'RUN.CANCELLED'])

// What the authority stores when a thread is created without a title
// (theorem_chat.rs normalizes a missing or blank title to it).
const UNTITLED = 'New Chat'

type RemoteThreadMetadata = Awaited<
  ReturnType<RemoteThreadListAdapter['fetch']>
>

function toMetadata(thread: Theorem.Thread): RemoteThreadMetadata {
  return {
    status: thread.status === 'archived' ? 'archived' : 'regular',
    remoteId: thread.threadId,
    title: thread.title || undefined,
    lastMessageAt:
      thread.lastMessageAtMs !== undefined
        ? new Date(thread.lastMessageAtMs)
        : undefined,
  }
}

function titleFrom(messages: ChatModelRunOptions['messages']): string {
  const first = messages.find((message) => message.role === 'user')
  const text =
    first?.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join(' ') ?? ''
  const line = text.replace(/\s+/g, ' ').trim()
  if (line.length <= 60) return line || 'New chat'
  const cut = line.slice(0, 60)
  const space = cut.lastIndexOf(' ')
  return `${space > 30 ? cut.slice(0, space) : cut}...`
}

/**
 * Name an untitled thread before its turn is sent. The send is revision
 * checked (If-Match on the revision the SDK just read), so a title written
 * from generateTitle, which assistant-ui fires as the user message lands,
 * would race it and fail the turn with a 409.
 */
async function titleUntitledThread(
  threadId: string,
  messages: ChatModelRunOptions['messages'],
) {
  const { thread } = await theorem().chat.threads.get({ threadId })
  if (thread.title && thread.title !== UNTITLED) return
  const title = titleFrom(messages)
  await mutateThread(threadId, (headers) =>
    theorem().chat.threads.update({ threadId, title, ...headers }),
  )
}

/** One SDK adapter per durable thread; it remembers local-to-durable message ids. */
const chatAdapters = new Map<string, ChatModelAdapter>()
function chatAdapterFor(threadId: string): ChatModelAdapter {
  let adapter = chatAdapters.get(threadId)
  if (!adapter) {
    adapter = createTheoremChatAdapter({ client: theorem(), threadId })
    chatAdapters.set(threadId, adapter)
  }
  return adapter
}

/**
 * An edit or regenerate in assistant-ui carries a local id for the user turn.
 * Map it onto the durable message at the same position of the selected branch
 * so the SDK issues edit/retry against Theorem instead of appending a new turn.
 */
async function alignWithDurableBranch(
  threadId: string,
  messages: ChatModelRunOptions['messages'],
): Promise<ChatModelRunOptions['messages']> {
  const user = messages.at(-1)
  if (!user || user.role !== 'user') return messages
  const { messages: durable } = await theorem().chat.threads.get({ threadId })
  if (durable.some((message) => message.messageId === user.id)) return messages
  const slot = durable[messages.length - 1]
  if (slot?.role !== 'user') return messages
  return [...messages.slice(0, -1), { ...user, id: slot.messageId }]
}

function contentOf(parts: Map<string, Theorem.StoredPart>) {
  const [message] = toAssistantMessages([
    {
      schema: 'theorem.chat.message.v1',
      messageId: 'live',
      tenantId: '',
      threadId: '',
      originBranchId: '',
      role: 'assistant',
      parts: [...parts.values()],
      createdAtMs: Date.now(),
    },
  ])
  return (message?.content ?? []) as ThreadAssistantMessagePart[]
}

/** Reattach to a run that was live when the thread loaded (reload, tab switch). */
async function* resumeLiveRun(
  runId: string,
  abortSignal: AbortSignal,
): AsyncGenerator<ChatModelRunResult, void> {
  const parts = new Map<string, Theorem.StoredPart>()
  let terminal = false
  let interrupted = false
  try {
    const stream = await theorem().chat.runs.events(
      { runId, after_seq: 0 },
      { abortSignal },
    )
    for await (const event of stream) {
      if (event.sourceEventType === 'CHAT.MESSAGE.PART') {
        const part = event.payload.part as Record<string, unknown> | undefined
        if (typeof part?.partId === 'string' && typeof part.type === 'string') {
          parts.set(part.partId, {
            partId: part.partId,
            type: part.type,
            payload: part,
          })
          yield {
            content: contentOf(parts),
            metadata: {
              custom: { theoremRunId: runId, theoremCursor: event.seq },
            },
          }
        }
      }
      if (
        event.sourceEventType === 'OUTCOME.RECORDED' &&
        event.payload.interrupted != null
      )
        interrupted = true
      if (TERMINAL.has(event.sourceEventType)) {
        terminal = true
        yield {
          content: contentOf(parts),
          status:
            event.sourceEventType === 'RUN.CANCELLED'
              ? { type: 'incomplete', reason: 'cancelled' }
              : event.sourceEventType === 'RUN.FAILED' || interrupted
                ? {
                    type: 'incomplete',
                    reason: 'error',
                    error: 'The Theorem run failed',
                  }
                : { type: 'complete', reason: 'stop' },
        }
        return
      }
    }
  } finally {
    if (!terminal && abortSignal.aborted) {
      await mutate((headers) =>
        theorem().chat.runs.cancel({
          runId,
          ...headers,
          reason: 'Stopped from Theorem UI',
        }),
      )
    }
  }
}

function useThreadAdapters() {
  const aui = useAui()
  // Run left open by the last history load; resume reattaches to it.
  const liveRunId = useRef<string | undefined>(undefined)
  const history = useMemo<ThreadHistoryAdapter>(() => {
    return {
      async load() {
        const { remoteId } = aui.threadListItem.getState()
        if (!remoteId) return { messages: [] }
        const snapshot = await theorem().chat.threads.get({
          threadId: remoteId,
        })
        const runId = snapshot.liveRun?.runId
        liveRunId.current = runId
        // The live run's message is rebuilt by resume from sequence zero.
        const settled = snapshot.messages.filter(
          (message) =>
            !runId || message.runId !== runId || message.role === 'user',
        )
        const repository = ExportedMessageRepository.fromArray(
          toAssistantMessages(settled, snapshot.thread),
        )
        return runId ? { ...repository, unstable_resume: true } : repository
      },
      async *resume({ abortSignal }) {
        const runId = liveRunId.current
        if (runId) yield* resumeLiveRun(runId, abortSignal)
      },
      // Theorem persists every turn itself; nothing to write from the client.
      async append() {},
    }
  }, [aui])
  return useMemo(() => ({ history }), [history])
}

function useTheoremThreadRuntime() {
  const aui = useAui()
  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run(options) {
        try {
          const { remoteId } = await aui.threadListItem.initialize()
          await titleUntitledThread(remoteId, options.messages)
          const messages = await alignWithDurableBranch(
            remoteId,
            options.messages,
          )
          const result = chatAdapterFor(remoteId).run({ ...options, messages })
          if (Symbol.asyncIterator in result) yield* result
          else yield await result
        } catch (error) {
          // The message shows the problem's detail, not the SDK's status dump.
          if (error instanceof TheoremError)
            throw new Error(describeError(error), { cause: error })
          throw error
        }
      },
    }),
    [aui],
  )
  return useLocalRuntime(adapter)
}

function createThreadListAdapter(projectId: string): RemoteThreadListAdapter {
  const client = theorem()
  return {
    async list(params) {
      const page = await client.chat.threads.list({
        projectId,
        cursor: params?.after,
        includeArchived: true,
        limit: 50,
      })
      return {
        threads: page.items.map(toMetadata),
        nextCursor: page.nextCursor,
      }
    },
    async initialize() {
      const created = await mutate((headers) =>
        client.chat.threads.create({ projectId, ...headers }),
      )
      return { remoteId: created.record.threadId }
    },
    async rename(remoteId, title) {
      await mutateThread(remoteId, (headers) =>
        client.chat.threads.update({ threadId: remoteId, title, ...headers }),
      )
    },
    async archive(remoteId) {
      await mutateThread(remoteId, (headers) =>
        client.chat.threads.update({
          threadId: remoteId,
          archived: true,
          ...headers,
        }),
      )
    },
    async unarchive(remoteId) {
      await mutateThread(remoteId, (headers) =>
        client.chat.threads.update({
          threadId: remoteId,
          archived: false,
          ...headers,
        }),
      )
    },
    async delete(remoteId) {
      await mutateThread(remoteId, (headers) =>
        client.chat.threads.delete({ threadId: remoteId, ...headers }),
      )
    },
    async fetch(remoteId) {
      const snapshot = await client.chat.threads.get({ threadId: remoteId })
      return toMetadata(snapshot.thread)
    },
    // Reports the title only; the run writes it (titleUntitledThread), and
    // both derive it from the same first user message.
    async generateTitle(remoteId, messages) {
      const { thread } = await client.chat.threads.get({ threadId: remoteId })
      const title =
        thread.title && thread.title !== UNTITLED
          ? thread.title
          : titleFrom(messages)
      return createAssistantStream((controller) => {
        controller.appendText(title)
      })
    },
    unstable_useAdapters: useThreadAdapters,
  }
}

// Welcome prompts, one per artifact kind the agent can open beside the thread.
const config = AuiConfig({
  suggestions: Suggestions([
    {
      title: 'Draft a document',
      label: 'a one-page brief on a topic you name',
      prompt:
        'Draft a one-page brief, as a document artifact, on why typed contracts between an agent and its UI matter.',
    },
    {
      title: 'Write some code',
      label: 'a small, complete TypeScript module',
      prompt:
        'Write a TypeScript module, as a code artifact, that debounces async functions and cancels stale calls.',
    },
    {
      title: 'Sketch a diagram',
      label: 'a Mermaid flowchart of a process',
      prompt:
        'Make a Mermaid diagram artifact of how a chat turn flows from the composer to the agent and back.',
    },
    {
      title: 'Think it through',
      label: 'a plain answer, no artifact',
      prompt:
        'What are the trade-offs between streaming tokens and sending a finished answer?',
    },
  ]),
})

export function TheoremRuntimeProvider({
  projectId,
  threadId,
  onThreadIdChange,
  children,
}: {
  projectId: string
  threadId: string | undefined
  onThreadIdChange: (threadId: string | undefined) => void
  children: ReactNode
}) {
  const adapter = useMemo(() => createThreadListAdapter(projectId), [projectId])
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: useTheoremThreadRuntime,
    adapter,
    threadId,
    onThreadIdChange,
  })
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      <TheoremPartRenderers />
      {children}
    </AssistantRuntimeProvider>
  )
}
