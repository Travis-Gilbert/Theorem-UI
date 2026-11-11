import type { AssistantRuntime } from '@assistant-ui/react'
import { describeError, mutate, TERMINAL_RUN_EVENTS, theorem } from './client'
import { createRunInputQueue, inputReceipt, runInputReceipt } from './run-input'
import { registerRunInputQueue, useRunInputs } from './run-input-store'

/** Binds native input to one assistant-ui observer without replacing its stream. */
export function bindRunInput(
  runtime: Pick<AssistantRuntime, 'thread'>,
  { threadKey, threadId, liveRuns, subscribe }: {
    threadKey: string
    threadId: () => string | undefined
    liveRuns: {
      getState: () => Partial<Record<string, string>>
      subscribe: (listener: () => void) => () => void
    }
    /** Notifies when the open chat may have received its durable id. */
    subscribe?: (listener: () => void) => () => void
  },
) {
  const visibleInputs = () => runtime.thread.getState().messages.flatMap((message) =>
    message.content.flatMap((part) => {
      const receipt = part.type === 'data' && part.name === 'theorem-user_input'
        ? inputReceipt(part.data) : undefined
      return receipt ? [receipt] : []
    }),
  )
  const queue = createRunInputQueue({
    snapshot() {
      const remoteId = threadId()
      const { isRunning, isLoading } = runtime.thread.getState()
      return { threadId: remoteId, runId: remoteId ? liveRuns.getState()[remoteId] : undefined, isRunning, isLoading, inputs: visibleInputs() }
    },
    async refresh() {
      const remoteId = threadId()
      if (!remoteId) throw new Error('The conversation has not been created yet')
      const snapshot = await theorem().chat.threads.get({ threadId: remoteId })
      return {
        active: Boolean(snapshot.liveRun || snapshot.thread.activeRunId || snapshot.thread.pendingTurn),
        runId: snapshot.liveRun?.runId,
        inputs: snapshot.messages.flatMap((message) => message.parts.flatMap((part) => {
          const receipt = part.type === 'user_input' ? inputReceipt(part.payload) : undefined
          return receipt ? [receipt] : []
        })),
      }
    },
    async send(runId, text, key) {
      const event = await mutate((headers) => theorem().chat.runs.command(
        { runId, command: 'input', ...headers, 'Idempotency-Key': key },
        { additionalBodyParameters: { text } },
      ))
      const receipt = runInputReceipt(event)
      if (!receipt) throw new Error('Theorem did not confirm this message')
      return receipt
    },
    async receipts(runId) {
      const receipts = new Map<string, NonNullable<ReturnType<typeof inputReceipt>>>()
      const events = await theorem().chat.runs.events(
        { runId, after_seq: 0 },
        { abortSignal: AbortSignal.timeout(10_000) },
      )
      let terminal = false
      for await (const event of events) {
        if (TERMINAL_RUN_EVENTS.has(event.sourceEventType)) terminal = true
        if (event.sourceEventType !== 'CHAT.MESSAGE.PART') continue
        const receipt = runInputReceipt(event)
        if (receipt) receipts.set(receipt.inputId, {
          ...receipt,
          requestKey: receipt.requestKey ?? receipts.get(receipt.inputId)?.requestKey,
        })
      }
      if (!terminal) throw new Error('The response has not finished recording its input receipts')
      return [...receipts.values()]
    },
    // A fallback belongs to its submitted text, not to references the person
    // may since have added to the next composer draft.
    append: (text) => runtime.thread.append({
      role: 'user', content: [{ type: 'text', text }],
      runConfig: { custom: { theoremRunInput: true } },
    }),
    changed: (items) => useRunInputs.setState({ [threadKey]: items }),
    describeError,
    attemptId: threadKey,
    storage: window.sessionStorage,
  })
  const unregister = registerRunInputQueue(threadKey, queue)
  const stopThread = runtime.thread.subscribe(queue.observe)
  const stopRuns = liveRuns.subscribe(queue.observe)
  let knownThreadId = threadId()
  const stopIdentity = subscribe?.(() => {
    const next = threadId()
    if (next === knownThreadId) return
    knownThreadId = next
    queue.observe()
  })
  const timer = setInterval(() => {
    if (queue.getSnapshot().length) queue.observe()
  }, 2_000)
  queue.observe()
  return () => { clearInterval(timer); stopThread(); stopRuns(); stopIdentity?.(); unregister() }
}
