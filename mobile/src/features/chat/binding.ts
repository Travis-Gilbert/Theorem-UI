// SOURCING: @theoremharness/sdk HeadlessConversation lifecycle (connect, observe, detach, send, stop) and projectThreadView; no React or React Native imports, so the lifecycle is testable on its own
//
// One HeadlessConversation per thread, shared by every view showing it. Views
// lease it: the first lease connects and observes, the last release detaches.
// Detaching only stops observation. Stopping a run is a separate, explicit
// command (cancel), never a side effect of a view going away, the app going
// to the background or a lease being dropped.
import type { ConversationState, Theorem } from '@theoremharness/sdk'

/** What a send may carry beyond its text: files Theorem already stored, and operations this client offers the turn. */
export type TurnExtras = {
  uploadIds?: string[]
  clientOperations?: Theorem.ClientOperationDeclaration[]
  clientSurface?: Theorem.ClientSurface
}

/** The part of HeadlessConversation the binding drives. */
export interface Conversation {
  readonly state: ConversationState
  subscribe(listener: (state: ConversationState) => void): () => void
  connect(): Promise<void>
  observe(): Promise<void>
  detach(): void
  send(id: string, request: { text: string } & TurnExtras): Promise<unknown>
  stop(id: string, reason?: string): Promise<void>
}

export type BindingOptions = {
  create: (threadId: string) => Conversation
  newId: () => string
  /** Reports failures no caller is waiting on (connect and observe). */
  onError?: (threadId: string, error: unknown) => void
}

class Session {
  leases = 0
  private observing: Promise<void> | undefined
  private attaching: Promise<void> | undefined

  constructor(
    readonly threadId: string,
    readonly conversation: Conversation,
    private readonly options: BindingOptions,
  ) {}

  /** Connects (replaying journaled commands under their original keys), then follows a live run. */
  attach(): Promise<void> {
    this.attaching ??= this.conversation
      .connect()
      .then(() => this.follow())
      .catch((error: unknown) => this.options.onError?.(this.threadId, error))
      .finally(() => {
        this.attaching = undefined
      })
    return this.attaching
  }

  /** Observes the run the journal points at, once; observe returns when it settles. */
  follow(): void {
    const { journal, projection } = this.conversation.state
    if (!journal?.runId || projection?.terminal || this.observing) return
    this.observing = this.conversation
      .observe()
      .catch((error: unknown) => this.options.onError?.(this.threadId, error))
      .finally(() => {
        this.observing = undefined
      })
  }

  detach(): void {
    this.conversation.detach()
    // detach aborts the observer; the next attach starts a fresh one.
    this.observing = undefined
  }
}

export type Lease = {
  readonly conversation: Conversation
  /** Resolves once the conversation is connected; a send before that is refused by the session. */
  ready(): Promise<void>
  /**
   * Admits a message. The command id is journaled first. A caller that must
   * survive termination (intake) supplies its own id, so the same delivery is
   * the same command however often it is resumed.
   */
  send(text: string, options?: { id?: string } & TurnExtras): Promise<unknown>
  /** The person pressed Stop: a durable cancel of the run or pending admission. */
  stop(): Promise<void>
  /** The view is gone. Observation may end; the run is not touched. */
  release(): void
}

export class ConversationBinding {
  private readonly sessions = new Map<string, Session>()
  private suspended = false

  constructor(private readonly options: BindingOptions) {}

  private session(threadId: string): Session {
    let session = this.sessions.get(threadId)
    if (!session) {
      session = new Session(threadId, this.options.create(threadId), this.options)
      this.sessions.set(threadId, session)
    }
    return session
  }

  retain(threadId: string): Lease {
    const session = this.session(threadId)
    session.leases += 1
    if (session.leases === 1 && !this.suspended) void session.attach()
    let released = false
    return {
      conversation: session.conversation,
      ready: () => session.attach(),
      send: async (text, options) => {
        const result = await session.conversation.send(options?.id ?? this.options.newId(), {
          text,
          ...(options?.uploadIds?.length ? { uploadIds: options.uploadIds } : {}),
          ...(options?.clientOperations?.length
            ? { clientOperations: options.clientOperations, clientSurface: options.clientSurface ?? { revision: 0 } }
            : {}),
        })
        session.follow()
        return result
      },
      stop: () => session.conversation.stop(this.options.newId()),
      release: () => {
        if (released) return
        released = true
        session.leases -= 1
        if (session.leases === 0) session.detach()
      },
    }
  }

  /** The app left the foreground: stop observing everything, stop nothing. */
  suspend(): void {
    this.suspended = true
    for (const session of this.sessions.values()) if (session.leases > 0) session.detach()
  }

  /** Back in the foreground: reconnect what is still on screen. */
  resume(): void {
    this.suspended = false
    for (const session of this.sessions.values()) if (session.leases > 0) void session.attach()
  }

  /** The person asked to retry a failed connection. */
  reconnect(threadId: string): void {
    const session = this.sessions.get(threadId)
    if (session && session.leases > 0 && !this.suspended) void session.attach()
  }

  /** Signing out: detach every session and forget them. */
  reset(): void {
    for (const session of this.sessions.values()) session.detach()
    this.sessions.clear()
  }
}
