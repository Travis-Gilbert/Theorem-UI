// SOURCING: @assistant-ui/react-native useExternalStoreRuntime over @theoremharness/sdk HeadlessConversation + projectThreadView (the external-store binding the web client can share)
//
// The Phase 0 binding choice: assistant-ui reads the headless session's
// projection and dispatches commands to it. It never runs its own agent loop
// and never owns a second copy of the conversation.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import * as Crypto from 'expo-crypto'
import {
  useExternalStoreRuntime,
  type AppendMessage,
  type AssistantRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react-native'
import { HeadlessConversation, type ConversationState } from '@theoremharness/sdk'
import { projectThreadView } from '@theoremharness/sdk/assistant-ui'
import { signIn } from '@/lib/auth'
import { config } from '@/lib/config'
import { onDraftChanged, readDraft, setCurrentThread, writeDraft } from '@/lib/drafts'
import { db } from '@/lib/local-db'
import { SignInError } from '@/lib/oauth'
import { createJournalStore } from '@/lib/journal-store'
import { theorem } from '@/lib/theorem'
import { phoneTurnOptions } from '../phone-actions/calendar'
import { ConversationBinding, type Lease } from './binding'
import { Outbox } from './outbox'
import type { QueuedMessage, QueueState } from './queue'
import { isWorking, type Recovery } from './recovery'

let shared: ConversationBinding | undefined

/** The app's one binding: one session per thread, however many views show it. */
export function conversations(): ConversationBinding {
  if (!shared) {
    const store = createJournalStore(db())
    shared = new ConversationBinding({
      create: (threadId) =>
        new HeadlessConversation({ client: theorem(), authority: config.authority, threadId, store }),
      newId: () => Crypto.randomUUID(),
    })
    // Leaving the foreground ends observation only; runs continue on the host.
    AppState.addEventListener('change', (status) => {
      if (status === 'active') shared?.resume()
      else if (status === 'background') shared?.suspend()
    })
  }
  return shared
}

let outgoing: Outbox | undefined

/** The app's one outbox: messages wait here during a run and go when the conversation is free. */
export function outbox(): Outbox {
  outgoing ??= new Outbox({
    binding: conversations(),
    newId: () => Crypto.randomUUID(),
    extras: phoneTurnOptions,
  })
  return outgoing
}

export function resetConversations() {
  outgoing?.reset()
  shared?.reset()
}

const textOf = (message: AppendMessage) =>
  message.content
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n\n')
    .trim()

export type ConversationView = {
  runtime: AssistantRuntime
  state: ConversationState
  runId: string | undefined
  /** A send the authority refused; its text is back in the composer. */
  sendError: unknown
  /** Messages sent during a run, waiting to go. Each can be taken back until it goes. */
  queued: QueuedMessage[]
  /** Stop was pressed: queued messages wait until the person sends again. */
  paused: boolean
  /** Takes a queued message out of the queue. */
  removeQueued: (id: string) => void
  /** Takes a queued message back into the composer to change it. */
  editQueued: (id: string) => void
  /** The one action a notice offered. Resolves; a failed sign-in is reported in `recoveryError`. */
  recover: (recovery: Recovery) => Promise<void>
  recoveryError: unknown
}

export function useConversation(threadId: string): ConversationView {
  const [lease, setLease] = useState<Lease>()
  const [state, setState] = useState<ConversationState>({ phase: 'detached' })
  const [sendError, setSendError] = useState<unknown>()
  const [recoveryError, setRecoveryError] = useState<unknown>()

  useEffect(() => {
    const next = conversations().retain(threadId)
    setLease(next)
    const unsubscribe = next.conversation.subscribe(setState)
    // Unmounting releases the view. It never stops the run.
    return () => {
      unsubscribe()
      next.release()
    }
  }, [threadId])

  const queue: QueueState = useSyncExternalStore(
    useCallback((listener) => outbox().subscribe(threadId, listener), [threadId]),
    () => outbox().snapshot(threadId),
  )

  const view = useMemo(() => projectThreadView(state), [state])
  const runtimeRef = useRef<AssistantRuntime>(undefined)
  const ready = !['detached', 'connecting', 'failed', 'authentication-required'].includes(state.phase)

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: view.messages,
    convertMessage: (message) => message,
    isRunning: isWorking(state, view.isRunning),
    isDisabled: !lease,
    // A run in progress does not disable Send: the message is queued and goes when the run ends.
    isSendDisabled: !ready,
    onNew: async (message) => {
      const text = textOf(message)
      if (!text) return
      setSendError(undefined)
      writeDraft(threadId, '')
      // The queued message owns the words from here; a refusal gives them back (see below).
      outbox().submit(threadId, text)
    },
    // The only path to cancellation: the person pressed Stop.
    onCancel: async () => {
      await outbox().stop(threadId)
    },
  })
  runtimeRef.current = runtime

  // A refused send is dropped from the journal; give the words back.
  useEffect(() => {
    const [refusal] = queue.refused
    if (!refusal) return
    const composer = runtimeRef.current?.thread.composer
    const current = composer?.getState().text ?? ''
    const text = current ? `${refusal.message.text}\n\n${current}` : refusal.message.text
    setSendError(refusal.error)
    composer?.setText(text)
    writeDraft(threadId, text)
    outbox().acknowledge(threadId, refusal.message.id)
  }, [queue.refused, threadId])

  const removeQueued = useCallback((id: string) => void outbox().remove(threadId, id), [threadId])
  const editQueued = useCallback(
    (id: string) => {
      const item = outbox().snapshot(threadId).items.find((entry) => entry.id === id)
      // Only a message that was still waiting can come back; one that already went is a real message.
      if (!item || !outbox().remove(threadId, id)) return
      const composer = runtimeRef.current?.thread.composer
      const current = composer?.getState().text ?? ''
      composer?.setText(current ? `${item.text}\n\n${current}` : item.text)
    },
    [threadId],
  )

  const recover = useCallback(
    async (recovery: Recovery) => {
      setRecoveryError(undefined)
      try {
        // Signing in again replaces the tokens only: drafts and journals stay.
        if (recovery === 'sign-in') await signIn()
        conversations().reconnect(threadId)
      } catch (error) {
        if (error instanceof SignInError && error.code === 'cancelled') return
        setRecoveryError(error)
      }
    },
    [threadId],
  )

  // Restore and keep the draft for this thread.
  useEffect(() => {
    const composer = runtime.thread.composer
    const saved = readDraft(threadId)
    if (saved && !composer.getState().text) composer.setText(saved)
    setCurrentThread(threadId)
    const unsubscribe = composer.subscribe(() => writeDraft(threadId, composer.getState().text))
    const unlisten = onDraftChanged((key) => {
      if (key === threadId) composer.setText(readDraft(threadId))
    })
    return () => {
      unsubscribe()
      unlisten()
    }
  }, [runtime, threadId])

  return {
    runtime,
    state,
    runId: view.runId,
    sendError,
    queued: queue.items,
    paused: queue.paused,
    removeQueued,
    editQueued,
    recover,
    recoveryError,
  }
}
