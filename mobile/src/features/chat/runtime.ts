// SOURCING: @assistant-ui/react-native useExternalStoreRuntime over @theoremharness/sdk HeadlessConversation + projectThreadView (the external-store binding the web client can share)
//
// The Phase 0 binding choice: assistant-ui reads the headless session's
// projection and dispatches commands to it. It never runs its own agent loop
// and never owns a second copy of the conversation.
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { config } from '@/lib/config'
import { onDraftChanged, readDraft, setCurrentThread, writeDraft } from '@/lib/drafts'
import { db } from '@/lib/local-db'
import { createJournalStore } from '@/lib/journal-store'
import { theorem } from '@/lib/theorem'
import { ConversationBinding, type Lease } from './binding'

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

export function resetConversations() {
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
}

export function useConversation(threadId: string): ConversationView {
  const [lease, setLease] = useState<Lease>()
  const [state, setState] = useState<ConversationState>({ phase: 'detached' })
  const [sendError, setSendError] = useState<unknown>()

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

  const view = useMemo(() => projectThreadView(state), [state])
  const runtimeRef = useRef<AssistantRuntime>(undefined)
  const ready = !['detached', 'connecting', 'failed', 'authentication-required'].includes(state.phase)

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: view.messages,
    convertMessage: (message) => message,
    isRunning: view.isRunning,
    isDisabled: !lease,
    isSendDisabled: !ready || view.isRunning,
    onNew: async (message) => {
      const text = textOf(message)
      if (!text || !lease) return
      setSendError(undefined)
      writeDraft(threadId, '')
      try {
        await lease.send(text)
      } catch (error) {
        // A refused send is dropped from the journal; give the words back.
        setSendError(error)
        runtimeRef.current?.thread.composer.setText(text)
        writeDraft(threadId, text)
      }
    },
    // The only path to cancellation: the person pressed Stop.
    onCancel: async () => {
      await lease?.stop()
    },
  })
  runtimeRef.current = runtime

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

  return { runtime, state, runId: view.runId, sendError }
}
