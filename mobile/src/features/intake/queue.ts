// SOURCING: ./deliver over the app's own pieces: conversations() (HeadlessConversation through the binding, so the send is journaled and idempotent), ./upload (Theorem's uploads route), ./store (SQLite). @theoremharness/sdk isDefiniteRefusal decides what is a refusal, as the SDK's own journal does.
//
// The app's one intake queue. A delivery is saved before anything is sent,
// driven in the background of the app, and resumed when the app comes back.
// Leaving a screen never cancels a delivery; removing one is the person's act.
import { useSyncExternalStore } from 'react'
import * as Crypto from 'expo-crypto'
import { isDefiniteRefusal, type ConversationState } from '@theoremharness/sdk'
import { conversations } from '@/features/chat/runtime'
import type { Lease } from '@/features/chat/binding'
import { db } from '@/lib/local-db'
import { describeError } from '@/lib/theorem'
import { phoneTurnOptions } from '../phone-actions/calendar'
import { deliver, type DeliverDeps, type SendAnswer } from './deliver'
import { discard, discardAll } from './files'
import { files, isPending, newDelivery, storedUploads, type Delivery, type IntakeItem, type Receiver } from './model'
import { createDeliveryStore, type DeliveryStore } from './store'
import { uploadFile } from './upload'

/** How long a delivery waits for a run already in progress before it asks the person. */
const BUSY_WAIT_MS = 10 * 60_000
const BUSY: ConversationState['phase'][] = ['running', 'requires-action', 'reconnecting']
const BROKEN: ConversationState['phase'][] = ['failed', 'authentication-required', 'detached', 'connecting']

let store: DeliveryStore | undefined
let list: Delivery[] = []
let loaded: Promise<void> | undefined
const running = new Set<string>()
/** Why a delivery is waiting right now. Not saved: it is only true while the app is doing it. */
let notes: Record<string, string> = {}
const listeners = new Set<() => void>()

const publish = () => {
  for (const listener of listeners) listener()
}

function put(delivery: Delivery) {
  list = [delivery, ...list.filter((entry) => entry.id !== delivery.id)].sort(
    (a, b) => b.createdAtMs - a.createdAtMs,
  )
  publish()
}

function note(id: string, text: string | undefined) {
  const { [id]: _gone, ...rest } = notes
  notes = text ? { ...rest, [id]: text } : rest
  publish()
}

async function connected(lease: Lease): Promise<ConversationState> {
  await lease.ready()
  const state = lease.conversation.state
  if (BROKEN.includes(state.phase))
    throw state.error ?? new Error('Could not connect to the conversation on Theorem.')
  return state
}

/** Resolves when the conversation can take a message; a run in progress is waited out, never stopped. */
function idle(lease: Lease, id: string): Promise<void> {
  if (!BUSY.includes(lease.conversation.state.phase)) return Promise.resolve()
  note(id, 'The conversation is in the middle of a run. This will be sent when the run ends.')
  return new Promise<void>((resolve, reject) => {
    let unsubscribe = () => {}
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error('The conversation was still running after ten minutes. Try again when it is free.'))
    }, BUSY_WAIT_MS)
    unsubscribe = lease.conversation.subscribe((state) => {
      if (BUSY.includes(state.phase)) return
      clearTimeout(timer)
      unsubscribe()
      if (BROKEN.includes(state.phase))
        reject(state.error ?? new Error('The connection to the conversation was lost.'))
      else resolve()
    })
  }).finally(() => note(id, undefined))
}

function findIn(state: ConversationState, delivery: Delivery, text: string, uploadIds: string[]) {
  const messages = state.snapshot?.messages ?? []
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.role !== 'user' || message.createdAtMs < delivery.createdAtMs - 5 * 60_000) continue
    const held = new Set(storedUploads(message))
    const sameFiles = uploadIds.length > 0 && uploadIds.every((uploadId) => held.has(uploadId))
    const sameText =
      uploadIds.length === 0 &&
      message.parts.some((part) => part.type === 'text' && (part.payload as { text?: string })?.text === text)
    if (sameFiles || sameText) return { record: message, run: { runId: message.runId } } satisfies SendAnswer
  }
  return undefined
}

const deps: DeliverDeps = {
  now: () => Date.now(),
  save: async (delivery) => {
    await store!.save(delivery)
    put(delivery)
  },
  upload: (delivery, file, key) => uploadFile(delivery.receiver.projectId, file, key),
  send: async (delivery, text, uploadIds) => {
    const lease = conversations().retain(delivery.receiver.threadId)
    try {
      await connected(lease)
      await idle(lease, delivery.id)
      return (await lease.send(text, { id: delivery.id, uploadIds, ...phoneTurnOptions() })) as SendAnswer | undefined
    } finally {
      // Releasing ends this queue's observation only. The run it started goes on.
      lease.release()
    }
  },
  findStored: async (delivery, text, uploadIds) => {
    const lease = conversations().retain(delivery.receiver.threadId)
    try {
      return findIn(await connected(lease), delivery, text, uploadIds)
    } finally {
      lease.release()
    }
  },
  // The SDK's rule for its own journal: a 4xx that is not auth or "retry later".
  isRefusal: isDefiniteRefusal,
  describe: describeError,
}

async function drive(id: string) {
  if (running.has(id)) return
  const delivery = list.find((entry) => entry.id === id)
  if (!delivery) return
  running.add(id)
  publish()
  try {
    await deliver(delivery, deps)
  } catch (error) {
    // deliver settles its own failures; this is the store itself failing.
    put({ ...delivery, stage: 'failed', stoppedAt: delivery.stoppedAt, error: describeError(error) })
  } finally {
    running.delete(id)
    publish()
  }
}

export const intake = {
  /** Reads what was saved and carries on with whatever was under way. Safe to call again. */
  load(): Promise<void> {
    loaded ??= (async () => {
      store = createDeliveryStore(db())
      list = (await store.all()).sort((a, b) => b.createdAtMs - a.createdAtMs)
      publish()
      for (const delivery of list) if (isPending(delivery)) void drive(delivery.id)
    })()
    return loaded
  },

  /** The app came back to the foreground: pick up what a suspension interrupted. */
  resume(): void {
    for (const delivery of list) if (isPending(delivery)) void drive(delivery.id)
  },

  /** Saves the delivery on this phone, then starts it. The promise resolves once it is saved, not once it is sent. */
  async send(input: { receiver: Receiver; instruction: string; items: IntakeItem[] }): Promise<Delivery> {
    await intake.load()
    const delivery = newDelivery({ id: Crypto.randomUUID(), nowMs: Date.now(), ...input })
    await store!.save(delivery)
    put(delivery)
    void drive(delivery.id)
    return delivery
  },

  /** The person asked again after a failure. The same delivery, the same keys. */
  retry(id: string): void {
    void drive(id)
  },

  /** Forgets a delivery on this phone and deletes its kept files. What Theorem already holds is untouched. */
  async remove(id: string): Promise<void> {
    const delivery = list.find((entry) => entry.id === id)
    if (!delivery || running.has(id)) return
    await store?.remove(id)
    for (const file of files(delivery)) discard(file.id)
    list = list.filter((entry) => entry.id !== id)
    publish()
  },

  /** Signing out: the rows go with the account's data (local-db.ts); this drops the files and the memory. */
  reset(): void {
    list = []
    notes = {}
    loaded = undefined
    try {
      discardAll()
    } catch {
      // Nothing was kept.
    }
    publish()
  },
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDeliveries(): Delivery[] {
  return useSyncExternalStore(subscribe, () => list)
}

export function useDelivery(id: string | undefined): { delivery?: Delivery; busy: boolean; note?: string } {
  const all = useDeliveries()
  const waiting = useSyncExternalStore(subscribe, () => notes)
  const delivery = id ? all.find((entry) => entry.id === id) : undefined
  return { delivery, busy: !!id && running.has(id), note: id ? waiting[id] : undefined }
}
