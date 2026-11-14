// SOURCING: ./queue (the ComposerQueue reducer) driven over ./binding leases (HeadlessConversation through the journal, so every send is journaled first under its own command id); the wait-for-idle approach follows features/intake/queue.ts
//
// The app's one outbox for the conversation composer. A message is admitted
// here with its command id, held while a run is going, and handed to the
// conversation when it is free. The outbox keeps its own lease while it holds
// anything, so leaving the screen does not strand a queued message, and
// releasing a lease never stops a run: only `stop` does.
import type { ConversationBinding, Lease, TurnExtras } from './binding'
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
}

export class Outbox {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly options: OutboxOptions) {}

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
  }

  private attach(threadId: string) {
    const entry = this.entry(threadId)
    if (entry.lease) return
    const lease = this.options.binding.retain(threadId)
    entry.lease = lease
    entry.unsubscribe = lease.conversation.subscribe((state) =>
      this.apply(threadId, { type: 'availability', availability: availability(state.phase) }),
    )
    // Not through apply(): an empty outbox would hand the lease straight back.
    entry.state = reduce(entry.state, {
      type: 'availability',
      availability: availability(lease.conversation.state.phase),
    }).state
  }

  /** Gives the lease back once nothing is waiting or on its way. */
  private settle(threadId: string, entry: Entry) {
    const { items, inflight, refused } = entry.state
    if (!entry.lease || items.length || inflight || refused.length) return
    entry.unsubscribe()
    entry.unsubscribe = () => {}
    entry.lease.release()
    entry.lease = undefined
  }

  private apply(threadId: string, event: QueueEvent) {
    const entry = this.entry(threadId)
    const { state, dispatch } = reduce(entry.state, event)
    const changed = state !== entry.state
    entry.state = state
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
    } catch (error) {
      this.apply(threadId, { type: 'refused', id: message.id, error })
    }
  }
}

export type { QueueState, QueuedMessage, Refusal }
