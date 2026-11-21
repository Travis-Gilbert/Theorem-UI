// SOURCING: ./queue (the ComposerQueue reducer) driven over ./binding leases (HeadlessConversation through the journal, so every send is journaled first under its own command id); ./outbox-store keeps waiting messages across termination; @theoremharness/sdk isDefiniteRefusal decides a refusal, as the SDK's own journal and features/intake/deliver.ts do; the wait-for-idle approach follows features/intake/queue.ts
//
// The app's one outbox for the conversation composer. A message is admitted
// here with its command id, held while a run is going, and handed to the
// conversation when it is free. The outbox keeps its own lease while it holds
// anything, so leaving the screen does not strand a queued message, and
// releasing a lease never stops a run: only `stop` does.
import { isDefiniteRefusal, type ConversationState } from '@theoremharness/sdk'
import type { ConversationBinding, Lease, TurnExtras } from './binding'
import type { OutboxStore } from './outbox-store'
import {
  availability,
  emptyQueue,
  reduce,
  type QueueEvent,
  type QueuedMessage,
  type QueueState,
  type Refusal,
} from './queue'

type Entry = {
  state: QueueState
  lease: Lease | undefined
  unsubscribe: () => void
  listeners: Set<() => void>
}

export type OutboxOptions = {
  binding: ConversationBinding
  newId: () => string
  /** What each send carries beyond its text (the phone's calendar operation). */
  extras?: () => TurnExtras
  /** Where waiting messages are kept so a terminated app returns them under their original ids. */
  store?: OutboxStore
}

/**
 * The run a send started has settled. A terminal projection is the SDK's own
 * signal; the terminal phases cover a conversation observed without one. A
 * `ready` published just after a send is not here: the run may still be starting.
 */
const settled = (state: ConversationState): boolean =>
  state.projection?.terminal === true ||
  ['completed', 'cancelled', 'interrupted', 'failed'].includes(state.phase)

/**
 * The words still owed a send: the waiting ones plus the dispatched one. The
 * dispatched message stays durable until its send resolves and the SDK journal
 * owns it, so a termination in that interval loses nothing; restoration retries
 * the same command id, which the journal deduplicates.
 */
const durableItems = (state: QueueState): QueuedMessage[] =>
  state.inflight ? [state.inflight, ...state.items] : state.items

export class Outbox {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly options: OutboxOptions) {
    // Carry on with what was waiting when the app last stopped, under the same
    // command ids and the same pause, so a message is never lost, never sent
    // twice under two ids, and never sent past a Stop without another Send.
    for (const { threadId, items, paused } of options.store?.load() ?? []) {
      if (!items.length && !paused) continue
      this.attach(threadId)
      this.apply(threadId, { type: 'restore', items, paused })
    }
  }

  private entry(threadId: string): Entry {
    let entry = this.entries.get(threadId)
    if (!entry) {
      entry = { state: emptyQueue, lease: undefined, unsubscribe: () => {}, listeners: new Set() }
      this.entries.set(threadId, entry)
    }
    return entry
  }

  /** Read by `useSyncExternalStore`: replaced on every change, never mutated. */
  snapshot = (threadId: string): QueueState => this.entries.get(threadId)?.state ?? emptyQueue

  subscribe = (threadId: string, listener: () => void): (() => void) => {
    const entry = this.entry(threadId)
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }

  /** Admits a message. It goes now if the conversation is free, otherwise when it is. Returns its command id. */
  submit(threadId: string, text: string): string {
    const message: QueuedMessage = { id: this.options.newId(), text }
    this.attach(threadId)
    // apply() saves the waiting words durably before it returns, so the caller
    // may clear the draft once submit is back: the message is kept somewhere.
    this.apply(threadId, { type: 'submit', message })
    return message.id
  }

  /** The person pressed Stop: the run is cancelled and nothing queued goes until they send again. */
  async stop(threadId: string): Promise<void> {
    const entry = this.entry(threadId)
    this.apply(threadId, { type: 'stopped' })
    const lease = entry.lease ?? this.options.binding.retain(threadId)
    try {
      await lease.stop()
    } finally {
      if (lease !== entry.lease) lease.release()
    }
  }

  /** Takes a message out of the queue. `false` when it had already gone. */
  remove(threadId: string, id: string): boolean {
    const had = this.snapshot(threadId).items.some((item) => item.id === id)
    this.apply(threadId, { type: 'remove', id })
    return had
  }

  acknowledge(threadId: string, id: string): void {
    this.apply(threadId, { type: 'acknowledge', id })
  }

  /** Signing out: nothing queued under one account may reach another. */
  reset(): void {
    for (const entry of this.entries.values()) {
      entry.unsubscribe()
      entry.lease?.release()
      for (const listener of entry.listeners) listener()
    }
    this.entries.clear()
    this.options.store?.clear()
  }

  private attach(threadId: string) {
    const entry = this.entry(threadId)
    if (entry.lease) return
    const lease = this.options.binding.retain(threadId)
    entry.lease = lease
    // HeadlessConversation calls a new subscriber at once. That first call is
    // not heard: through apply() an outbox that is still empty would hand the
    // lease straight back, and the message being admitted would go nowhere.
    let attached = false
    entry.unsubscribe = lease.conversation.subscribe((state) => {
      if (!attached) return
      this.apply(threadId, { type: 'availability', availability: availability(state.phase) })
      // The run the last send started has settled: the queue may go on.
      if (entry.state.settling && settled(state)) this.apply(threadId, { type: 'run-settled' })
    })
    attached = true
    entry.state = reduce(entry.state, {
      type: 'availability',
      availability: availability(lease.conversation.state.phase),
    }).state
  }

  /** Gives the lease back once nothing is waiting, on its way, or settling. */
  private settle(threadId: string, entry: Entry) {
    const { items, inflight, settling, refused } = entry.state
    if (!entry.lease || items.length || inflight || settling || refused.length) return
    entry.unsubscribe()
    entry.unsubscribe = () => {}
    entry.lease.release()
    entry.lease = undefined
  }

  private apply(threadId: string, event: QueueEvent) {
    const entry = this.entry(threadId)
    const previous = entry.state
    const { state, dispatch } = reduce(previous, event)
    const changed = state !== previous
    const durableChanged =
      state.items !== previous.items || state.inflight !== previous.inflight || state.paused !== previous.paused
    // Admitting new words must be durable before they are published or dispatched.
    // If storage fails, submit throws and the caller keeps the draft; nothing is
    // left inflight that no completion can clear.
    if (event.type === 'submit' && durableChanged)
      this.options.store?.save(threadId, durableItems(state), state.paused)
    entry.state = state
    // Later lifecycle changes are best-effort: the words are already durable, and
    // a stale row only re-dispatches under the same command id, which deduplicates.
    if (event.type !== 'submit' && durableChanged) {
      try {
        this.options.store?.save(threadId, durableItems(state), state.paused)
      } catch {
        // Keep the prior durable queue; a recovered write retries the same id.
      }
    }
    if (dispatch) void this.dispatch(threadId, entry, dispatch)
    if (changed) for (const listener of entry.listeners) listener()
    this.settle(threadId, entry)
  }

  private async dispatch(threadId: string, entry: Entry, message: QueuedMessage) {
    const lease = entry.lease
    if (!lease) return
    try {
      // The queued id is the command id: asking again would be the same command.
      await lease.send(message.text, { id: message.id, ...this.options.extras?.() })
      this.apply(threadId, { type: 'sent', id: message.id })
      // A fast run may already be settled; free the queue at once then.
      if (settled(lease.conversation.state)) this.apply(threadId, { type: 'run-settled' })
    } catch (error) {
      // The SDK's rule for its own journal: a definite no is dropped and its
      // words go back; anything else leaves the outcome unknown, so the message
      // keeps its id and waits rather than being sent again under a fresh one.
      if (isDefiniteRefusal(error)) this.apply(threadId, { type: 'refused', id: message.id, error })
      else this.apply(threadId, { type: 'uncertain', id: message.id, error })
    }
  }
}

export type { QueueState, QueuedMessage, Refusal }
