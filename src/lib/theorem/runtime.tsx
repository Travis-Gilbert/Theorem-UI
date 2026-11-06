// SOURCING: @assistant-ui/react (useRemoteThreadListRuntime + useLocalRuntime) with @theoremharness/sdk/assistant-ui (createTheoremChatAdapter, toAssistantMessages)
//
// Theorem owns durable history, execution and approvals. assistant-ui owns the
// view state. The thread list maps onto Theorem threads in the active project;
// per-thread history is the selected branch from threads.get; turns run through
// the SDK adapter. The hand-written pieces are live-run resume and mid-turn
// reconnect: an event stream that ends before a terminal event is a disconnect
// the contract resumes from the last durable sequence, not a completion (it
// reuses the SDK's part mapping via toAssistantMessages).
import {
  AssistantRuntimeProvider,
  ExportedMessageRepository,
  useAui,
  useAuiState,
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
import {
  createTheoremChatAdapter,
  toAssistantMessages,
} from '@theoremharness/sdk/assistant-ui'
import type { TheoremChatAdapterOptions } from '@theoremharness/sdk/assistant-ui'
import { createAssistantStream } from 'assistant-stream'
import pMap from 'p-map'
import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import { refreshConversation } from './conversation-refresh'
import type { ReactNode } from 'react'
import { useComposerReferences } from '@/components/chat/composer-references'
import { TheoremPartRenderers } from '@/components/chat/theorem-parts'
import { useShell } from '@/components/shell/shell-state'
import { documentThreadIds } from '@/lib/documents/ask-store'
import {
  describeError,
  describeRunFailure,
  holdRefusedText,
  hasStatus,
  mutate,
  mutateThread,
  pendingSendKey,
  recoverPendingSend,
  takeRefusedText,
  TERMINAL_RUN_EVENTS,
  theorem,
} from './client'
import type { Theorem } from './client'
import { RefusedSend } from './send-recovery'
import { pickedModelTurnOptions } from './models'

import { toHistoryMessages } from './message-history'
import { isUntitledTitle, threadTitle } from './thread-title'

type RemoteThreadMetadata = Awaited<
  ReturnType<RemoteThreadListAdapter['fetch']>
>

function toMetadata(
  thread: Theorem.Thread,
  title = thread.title,
): RemoteThreadMetadata {
  return {
    status: thread.status === 'archived' ? 'archived' : 'regular',
    remoteId: thread.threadId,
    title: title || undefined,
    lastMessageAt:
      thread.lastMessageAtMs !== undefined
        ? new Date(thread.lastMessageAtMs)
        : undefined,
    // The sidebar nests a forked or continued thread under its source.
    custom: thread.origin ? { origin: thread.origin } : undefined,
  }
}

/** Title writes belong before the SDK reads the revision for its send. */
async function titleUntitledThread(
  threadId: string,
  messages: ChatModelRunOptions['messages'],
) {
  const client = theorem()
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = await client.chat.threads.get({ threadId })
    const title = threadTitle(snapshot, messages)
    if (!isUntitledTitle(snapshot.thread.title) || isUntitledTitle(title))
      return
    try {
      await mutate((headers) =>
        client.chat.threads.update({
          threadId,
          title,
          ...headers,
          'If-Match': String(snapshot.thread.revision),
        }),
      )
      return
    } catch (error) {
      // Re-read both title and revision: a concurrent custom rename wins.
      if (!hasStatus(error, 409, 412)) throw error
    }
  }
}

/** Per-turn run settings, such as the agent terminal's coding execution mode. */
export type TurnOptions = TheoremChatAdapterOptions['turnOptions']
/**
 * One SDK adapter per durable thread; it remembers local-to-durable message
 * ids. A thread keeps the turn options it was first run with.
 */
const chatAdapters = new Map<string, ChatModelAdapter>()
const runFailures = new Map<string, string>()

/**
 * The run each thread has going, by thread id, from its stream's first event
 * until its terminal one: what mid-run input is sent to. A message's run id
 * arrives only with its first part, which may be a model step away.
 */
export const useLiveRuns = create<Partial<Record<string, string>>>(() => ({}))

function noteLiveRun(threadId: string, runId: string | undefined) {
  if (useLiveRuns.getState()[threadId] === runId) return
  useLiveRuns.setState({ [threadId]: runId })
}
function chatAdapterFor(
  threadId: string,
  turnOptions?: TurnOptions,
): ChatModelAdapter {
  let adapter = chatAdapters.get(threadId)
  if (!adapter) {
    adapter = createTheoremChatAdapter({
      client: theorem(),
      threadId,
      turnOptions,
      onEvent(event) {
        if (event.sourceEventType === 'RUN.FAILED') {
          runFailures.set(threadId, describeRunFailure(event.payload))
        }
        noteLiveRun(
          threadId,
          TERMINAL_RUN_EVENTS.has(event.sourceEventType)
            ? undefined
            : event.runId,
        )
      },
    })
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

/** Reopen attempts for a run-event stream that died before a terminal event. */
const RESUME_ATTEMPTS = 8
const RESUME_BACKOFF_MS = 250

type RunStatus = NonNullable<ChatModelRunResult['status']>

function resumeBackoff(attempt: number): Promise<void> {
  const ms = Math.min(RESUME_BACKOFF_MS * 2 ** attempt, 2000)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Tail a run's durable events to a terminal event, rebuilding message parts as
 * they arrive. A stream that ends or fails before a terminal event is a
 * disconnect, not a completion: the contract resumes it from the last durable
 * sequence, so this reopens the tail as a bounded replay from sequence zero
 * and continues, up to RESUME_ATTEMPTS times. An abort ends silently; the
 * caller settles the run.
 */
export async function* tailRun(
  runId: string,
  abortSignal: AbortSignal,
): AsyncGenerator<ChatModelRunResult, void> {
  const parts = new Map<string, Theorem.StoredPart>()
  for (let attempt = 0; ; attempt++) {
    let interrupted = false
    let status: RunStatus | undefined
    try {
      const stream = await theorem().chat.runs.events(
        { runId, after_seq: 0 },
        { abortSignal },
      )
      for await (const event of stream) {
        if (event.sourceEventType === 'CHAT.MESSAGE.PART') {
          const part = event.payload.part as Record<string, unknown> | undefined
          if (
            typeof part?.partId === 'string' &&
            typeof part.type === 'string'
          ) {
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
        if (TERMINAL_RUN_EVENTS.has(event.sourceEventType)) {
          status =
            event.sourceEventType === 'RUN.CANCELLED'
              ? { type: 'incomplete', reason: 'cancelled' }
              : event.sourceEventType === 'RUN.FAILED' || interrupted
                ? {
                    type: 'incomplete',
                    reason: 'error',
                    error: describeRunFailure(event.payload),
                  }
                : { type: 'complete', reason: 'stop' }
        }
      }
    } catch (error) {
      if (abortSignal.aborted) return
      if (attempt + 1 >= RESUME_ATTEMPTS) throw error
    }
    if (abortSignal.aborted) return
    if (status) {
      yield { content: contentOf(parts), status }
      return
    }
    if (attempt + 1 >= RESUME_ATTEMPTS) {
      throw new Error(
        `Theorem run ${runId} disconnected before a terminal event`,
      )
    }
    await resumeBackoff(attempt)
  }
}

/** Reattach to a run that was live when the thread loaded (reload, tab switch). */
async function* resumeLiveRun(
  runId: string,
  abortSignal: AbortSignal,
  threadId: string,
): AsyncGenerator<ChatModelRunResult, void> {
  let settled = false
  noteLiveRun(threadId, runId)
  try {
    for await (const result of tailRun(runId, abortSignal)) {
      if (result.status) settled = true
      yield result
    }
  } finally {
    noteLiveRun(threadId, undefined)
    if (!settled && abortSignal.aborted) {
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

/**
 * What a thread's last history load left for resume. assistant-ui resumes on
 * whichever adapter is current by then, which may not be the one that loaded.
 */
const loadedForResume = new Map<
  string,
  { runId?: string; recoveryError?: unknown }
>()

/**
 * History for one durable thread: the selected branch from threads.get, with
 * a run that was live at load reattached by resume. `threadId` is read at load
 * time; undefined means a thread not created yet.
 */
export function createHistoryAdapter(
  threadId: () => string | undefined,
  /** A refused send's text was held under its thread, as history lacks it. */
  onRefused?: () => void,
): ThreadHistoryAdapter {
  return {
    async load() {
      const remoteId = threadId()
      if (!remoteId) return { messages: [] }
      let recoveryError: unknown
      try {
        await recoverPendingSend(remoteId)
      } catch (error) {
        recoveryError = error
        if (error instanceof RefusedSend) {
          holdRefusedText(remoteId, error.text)
          onRefused?.()
        }
      }
      const snapshot = await theorem().chat.threads.get({
        threadId: remoteId,
      })
      const runId = snapshot.liveRun?.runId
      // The live run's message is rebuilt by resume from sequence zero.
      const settled = snapshot.messages.filter(
        (message) =>
          !runId || message.runId !== runId || message.role === 'user',
      )
      const repository = ExportedMessageRepository.fromArray(
        toHistoryMessages(settled, snapshot.thread),
      )
      if (!runId && !recoveryError) return repository
      loadedForResume.set(remoteId, { runId, recoveryError })
      return { ...repository, unstable_resume: true }
    },
    async *resume({ abortSignal }) {
      const remoteId = threadId()
      const { runId, recoveryError } =
        (remoteId && loadedForResume.get(remoteId)) || {}
      if (remoteId) loadedForResume.delete(remoteId)
      if (runId && remoteId) yield* resumeLiveRun(runId, abortSignal, remoteId)
      else if (recoveryError) throw new Error(describeError(recoveryError), { cause: recoveryError })
    },
    // Theorem persists every turn itself; nothing to write from the client.
    async append() {},
  }
}

/**
 * Puts a refused send's text in this thread's composer, if this is the open chat.
 * Only the open chat's composer is reachable, so the text waits until then.
 */
function giveBackRefusedText(aui: ReturnType<typeof useAui>) {
  const { id, remoteId } = aui.threadListItem.getState()
  if (!remoteId || aui.threads.getState().mainThreadId !== id) return
  const text = takeRefusedText(remoteId)
  if (text === undefined) return
  const composer = aui.threads.thread('main').composer()
  const draft = composer.getState().text.trimEnd()
  composer.setText(draft ? `${text}\n\n${draft}` : text)
}

function useThreadAdapters() {
  const aui = useAui()
  const open = useAuiState(
    (s) => s.threads.mainThreadId === s.threadListItem.id,
  )
  useEffect(() => {
    if (open) giveBackRefusedText(aui)
  }, [aui, open])
  const history = useMemo(
    () =>
      createHistoryAdapter(
        () => aui.threadListItem.getState().remoteId,
        () => giveBackRefusedText(aui),
      ),
    [aui],
  )
  return useMemo(() => ({ history }), [history])
}

/**
 * Runs one assistant-ui turn on a durable thread through the SDK adapter.
 * Edits and regenerates align with the durable branch first.
 */
export async function* runTurn(
  threadId: string,
  options: ChatModelRunOptions,
  turnOptions?: TurnOptions,
  accepted?: () => void,
): AsyncGenerator<ChatModelRunResult, void> {
  const text = options.messages.at(-1)?.content
    .map((part) => part.type === 'text' ? part.text : '').join('\n')
  const recovered = await recoverPendingSend(threadId, text, options.abortSignal).catch((error: unknown) => {
    // Refused for good: that one is over, so this send is the turn.
    if (pendingSendKey(threadId)) throw error
    return undefined
  })
  if (recovered) {
    yield* resumeLiveRun(recovered, options.abortSignal, threadId)
    return
  }
  runFailures.delete(threadId)
  await titleUntitledThread(threadId, options.messages)
  const messages = await alignWithDurableBranch(threadId, options.messages)
  const result = chatAdapterFor(threadId, turnOptions).run({
    ...options,
    messages,
  })
  if (!(Symbol.asyncIterator in result)) {
    const step = await result
    accepted?.()
    yield step
    return
  }
  let runId: string | undefined
  let didAccept = false
  try {
    for await (const step of result) {
      if (!didAccept) { accepted?.(); didAccept = true }
      const custom = step.metadata?.custom as
        { theoremRunId?: string } | undefined
      runId = custom?.theoremRunId ?? runId
      if (step.status?.type === 'incomplete' && step.status.reason === 'error') {
        yield { ...step, status: { ...step.status, error: runFailures.get(threadId) ?? describeRunFailure({}) } }
        runFailures.delete(threadId)
      } else {
        yield step
      }
    }
  } catch (error) {
    // The SDK adapter throws when its event stream dies before a terminal
    // event; that is a disconnect the contract resumes from the durable log,
    // so finish the turn from there instead of surfacing the banner. The run
    // id comes from streamed metadata, or from the SDK's disconnect message
    // when nothing streamed yet.
    if (options.abortSignal.aborted) throw error
    const known =
      runId ??
      /^Theorem run (\S+) disconnected before a terminal event/.exec(
        error instanceof Error ? error.message : '',
      )?.[1]
    if (!known) {
      const resumed = await recoverPendingSend(threadId, text, options.abortSignal)
      if (!resumed) throw error
      if (!didAccept) accepted?.()
      yield* resumeLiveRun(resumed, options.abortSignal, threadId)
      return
    }
    if (!didAccept) accepted?.()
    yield* resumeLiveRun(known, options.abortSignal, threadId)
  } finally {
    // A stop ends the stream without a terminal event.
    noteLiveRun(threadId, undefined)
  }
}
function useTheoremThreadRuntime() {
  const aui = useAui()
  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run(options) {
        try {
          const references = useComposerReferences.getState().references
          const { remoteId } = await aui.threadListItem.initialize()
          // The composer's model pick; read at each send, so switching mid-thread takes effect.
          const custom = options.runConfig.custom ?? {}
          const configured = custom.theoremTurnOptions as Record<string,unknown> | undefined
          const referenced = references.length ? {
            ...options,
            runConfig:{...options.runConfig,custom:{...custom,theoremTurnOptions:{...configured,contextReferences:references}}},
          } : options
          yield* runTurn(remoteId,referenced,pickedModelTurnOptions,()=>{
            // Recovery replays its saved request; only a newly accepted send consumes these references.
            useComposerReferences.setState(state=>({references:state.references.filter(reference=>!references.includes(reference))}))
          })
        } catch (error) {
          if (options.abortSignal.aborted) throw error
          // Keep SDK exceptions intact for recovery above; only format at
          // the presentation boundary consumed by MessagePrimitive.Error.
          throw new Error(describeError(error), { cause: error })
        }
      },
    }),
    [aui],
  )
  const runtime = useLocalRuntime(adapter)
  useEffect(() => {
    let busy = false
    const abort = new AbortController()
    const refresh = async () => {
      const remoteId = aui.threadListItem.getState().remoteId
      if (busy || !remoteId || document.visibilityState !== 'visible') return
      busy = true
      try { await refreshConversation(runtime.thread,()=>theorem().chat.threads.get({threadId:remoteId},{abortSignal:abort.signal})) }
      catch { /* A failed refresh leaves the last confirmed transcript intact. */ }
      finally { busy = false }
    }
    const timer = setInterval(()=>void refresh(),3000)
    return () => {clearInterval(timer);abort.abort()}
  },[aui,runtime])
  return runtime
}

export function createThreadListAdapter(projectId: string): RemoteThreadListAdapter {
  const client = theorem()
  return {
    async list(params) {
      const page = await client.chat.threads.list({
        projectId,
        cursor: params?.after,
        includeArchived: true,
        limit: 50,
      })
      // The agent terminal's threads live in its drawer, and each note's
      // conversation on the document screen, not among the chats.
      const apart = new Set([
        ...useShell.getState().terminalThreadIds,
        ...documentThreadIds(),
      ])
      return {
        threads: await pMap(
          page.items.filter((thread) => !apart.has(thread.threadId)),
          async (thread) => {
            if (!isUntitledTitle(thread.title)) return toMetadata(thread)
            try {
              const snapshot = await client.chat.threads.get(
                { threadId: thread.threadId },
                { timeoutInSeconds: 10, maxRetries: 0 },
              )
              return toMetadata(snapshot.thread, threadTitle(snapshot))
            } catch {
              // One inaccessible history must not hide the rest of the chats.
              return toMetadata(thread)
            }
          },
          { concurrency: 4 },
        ),
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
      return toMetadata(snapshot.thread, threadTitle(snapshot))
    },
    // This callback runs concurrently with sends; only runTurn writes titles.
    async generateTitle(remoteId, messages) {
      const snapshot = await client.chat.threads.get({ threadId: remoteId })
      const title = threadTitle(snapshot, messages)
      return createAssistantStream((controller) => {
        controller.appendText(title)
      })
    },
    unstable_useAdapters: useThreadAdapters,
  }
}

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
    <AssistantRuntimeProvider runtime={runtime}>
      <TheoremPartRenderers />
      {children}
    </AssistantRuntimeProvider>
  )
}
