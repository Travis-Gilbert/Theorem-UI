// SOURCING: @theoremharness/sdk — TheoremClient carries every request, WorkspaceLive the resumable
// live stream (cursor = `<epoch>:<seq>`, a cursor the host cannot continue from becomes a resync),
// DocumentSession shared editing, TerminalChannel the shell, WorkspaceLanguage and WorkspaceScm the
// typed language and git calls. This file only holds one instance of each for the page and
// shares document sessions between the editor and everything else that opens a file. It follows
// the shape of Theorem UI's Theia connection (ide/theia-extensions/theorem-workspace) without
// importing it: that is a Theia module under another licence.

import {
  DocumentSession,
  TheoremClient,
  WorkspaceLanguage,
  WorkspaceLive,
  WorkspaceScm,
  type TerminalChannelOptions,
} from '@theoremharness/sdk'

/** Headers every workspace operation carries. */
export interface OperationHeaders {
  workspaceId: string
  'X-CSRF-Token': string
  'Idempotency-Key': string
}

export type ChannelOptions = TerminalChannelOptions

/** A shared document session held until `release` is called. */
export interface DocumentLease {
  readonly session: DocumentSession
  release(): void
}

export interface ConnectionOptions {
  /** Same-origin product server: it holds the credential and the CSRF check. */
  baseUrl: string
  workspaceId: string
  /** The workspace's display name: the virtual project root is `/<name>`. */
  name: string
  fetch?: typeof fetch
  /** Where the live cursor survives a page reload. Absent or failing, a reload starts at the head. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  /** A consumer that could not re-read after a resync (default: a console warning). */
  onResyncError?: (error: unknown) => void
}

type Send = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** The host's refusal of a request for a workspace it has not opened (since it started). */
async function isNotOpen(response: Response): Promise<boolean> {
  try {
    const body: unknown = await response.clone().json()
    return typeof body === 'object' && body !== null && (body as { code?: unknown }).code === 'workspace_not_open'
  } catch {
    return false
  }
}

/**
 * A refused `documents.edit` that says the authority holds an OLDER revision than the session that
 * sent it (`current_revision` below `base_revision`). A stale edit normally means the session is
 * behind and reads the history it is missing; here there is none to read, so the SDK would send the
 * same edit again at once, without end. What a host that restarted answers for a document it has
 * not seated again, and what any authority that lost revisions answers.
 */
async function authorityBehind(response: Response): Promise<{ resource: string; body: object } | undefined> {
  if (response.status !== 409) return undefined
  try {
    const body = (await response.clone().json()) as {
      code?: unknown
      detail?: { base_revision?: unknown; current_revision?: unknown; resource_id?: unknown }
    }
    const { base_revision: base, current_revision: current, resource_id: resource } = body.detail ?? {}
    const behind = body.code === 'stale_revision' && typeof base === 'number' && typeof current === 'number' && current < base
    return behind && typeof resource === 'string' ? { resource, body } : undefined
  } catch {
    return undefined
  }
}

/** `typeof fetch` also asks for Bun's `preconnect`, which the SDK never calls. */
const asFetch = (send: Send) => send as typeof fetch

/**
 * Keep one failing consumer from holding the live stream. `WorkspaceLive` awaits every resync
 * listener inside the loop that reads the stream and takes a rejection as the stream failing: the
 * cursor does not move, it reconnects at the same cursor, the host answers the same resync, the
 * same listener rejects, and every hello resets the back-off. A terminal whose shell died with the
 * host does exactly that (its re-read is refused for good), and the stream then never delivers
 * another event. The SDK's own consumers (document sessions, terminal channels) register on this
 * instance, so wrapping `onResync` here covers them without touching the SDK. A consumer that
 * failed stays stale until its next event or resync; the failure is reported, not swallowed.
 */
function isolateResyncListeners(live: WorkspaceLive, failed: (error: unknown) => void): void {
  const register = live.onResync.bind(live)
  live.onResync = (listener) =>
    register(async (resync) => {
      try {
        await listener(resync)
      } catch (error) {
        failed(error)
      }
    })
}

const cursorKey = (workspaceId: string) => `theorem-ide-cm.live-cursor.${workspaceId}`

function readCursor(storage: ConnectionOptions['storage'], workspaceId: string): string | undefined {
  try {
    return storage?.getItem(cursorKey(workspaceId)) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * The page's attachment to one Theorem workspace. Requests go to the product server on the
 * page's own origin; the credential stays there.
 */
export class WorkspaceConnection {
  readonly client: TheoremClient
  /** Same transport without the reopening in `keepOpen`: what reopening itself sends cannot wait on reopening. */
  private readonly direct: TheoremClient
  readonly workspaceId: string
  readonly name: string
  /** The project root as the frontend sees it: absolute, `/`-separated. */
  readonly root: string
  readonly live: WorkspaceLive
  /** Resolves once the workspace is open and the live stream has started. */
  readonly ready: Promise<void>

  private csrfToken = ''
  private reopening: Promise<void> | undefined
  private readonly documents = new Map<string, { session: Promise<DocumentSession>; refs: number }>()
  private languageCalls: Promise<WorkspaceLanguage> | undefined
  private scmCalls: Promise<WorkspaceScm> | undefined

  constructor(private readonly options: ConnectionOptions) {
    this.workspaceId = options.workspaceId
    this.name = options.name
    this.root = `/${options.name}`
    const send: Send = options.fetch ?? ((input, init) => fetch(input, init))
    this.client = new TheoremClient({
      baseUrl: options.baseUrl,
      auth: false,
      fetch: asFetch((input, init) => this.keepOpen(send, input, init)),
    })
    this.direct = new TheoremClient({
      baseUrl: options.baseUrl,
      auth: false,
      fetch: asFetch((input, init) => send(input, this.withCurrentToken(init))),
    })
    this.live = new WorkspaceLive({
      client: this.client,
      workspaceId: this.workspaceId,
      cursor: readCursor(options.storage, this.workspaceId),
    })
    isolateResyncListeners(this.live, options.onResyncError ?? ((error) => console.warn('[ide-cm] a live consumer could not re-read after a resync', error)))
    this.ready = this.open()
  }

  private async open(): Promise<void> {
    await this.attach()
    // `start` settles when the stream is closed for good (sign-in lost, workspace deleted); the
    // state listeners already show that, so the rejection has no further reader.
    void this.live.start().catch(() => {})
  }

  /** Bootstrap, then ask the host to open the workspace: idempotent, so it is also how it is reopened. */
  private async attach(): Promise<void> {
    const { csrfToken } = await this.client.environment.bootstrap()
    this.csrfToken = csrfToken
    await this.client.remoteWorkspaces.open({
      'X-CSRF-Token': csrfToken,
      'Idempotency-Key': crypto.randomUUID(),
      workspace_id: this.workspaceId,
    })
  }

  /**
   * Every request the SDK makes. A host that restarted keeps the workspace and each document's
   * authority on disk but has neither open nor seated, and answers `workspace_not_open` (404)
   * until it is asked again; the SDK takes a 404 on the live stream as final, and a document
   * session would treat one on an edit as a refusal and drop the edit. So the connection reopens
   * the workspace, seats the documents it holds again, and repeats the request once. SDK requests
   * carry an `Idempotency-Key`, so repeating one is safe. The CSRF token of a reopen replaces the
   * one the SDK's long-lived sessions captured.
   *
   * An edit the authority refuses as BEHIND the session (`authorityBehind`) gets the same: seat
   * that document again and repeat once. If the authority is still behind, the refusal is
   * returned under a code the SDK does not take as "catch up", so the session drops the edit and
   * shows the authority's text (`onError`) instead of sending it again without end.
   */
  private async keepOpen(send: Send, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const attempt = () => send(input, this.withCurrentToken(init))
    let response = await attempt()
    if (response.status === 404 && (await isNotOpen(response))) {
      await this.reopen()
      response = await attempt()
    }
    const behind = await authorityBehind(response)
    if (!behind) return response
    await this.seat(behind.resource)
    const again = await attempt()
    const still = await authorityBehind(again)
    return still ? Response.json({ ...still.body, code: 'authority_behind' }, { status: 409 }) : again
  }

  /** One reopening for every request that found the workspace closed. */
  private reopen(): Promise<void> {
    return (this.reopening ??= this.attach()
      .then(() => Promise.allSettled([...this.documents.keys()].map((path) => this.seat(path))))
      .then(() => undefined)
      .finally(() => (this.reopening = undefined)))
  }

  /** Ask the host to open a document: it seats the session again from the authority's head. */
  private seat(resourceId: string) {
    return this.direct.documentSessions.open({
      workspaceId: this.workspaceId,
      'X-CSRF-Token': this.csrfToken,
      'Idempotency-Key': crypto.randomUUID(),
      resource_id: resourceId,
    })
  }

  private withCurrentToken(init: RequestInit | undefined): RequestInit | undefined {
    if (!init?.headers || !this.csrfToken) return init
    const headers = new Headers(init.headers)
    if (headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', this.csrfToken)
    return { ...init, headers }
  }

  /** Remember where the live stream stands, so a reload resumes instead of starting at the head. */
  saveCursor(): void {
    const cursor = this.live.cursor
    if (!cursor) return
    try {
      this.options.storage?.setItem(cursorKey(this.workspaceId), cursor)
    } catch {
      /* storage unavailable: the next load starts at the head */
    }
  }

  async headers(): Promise<OperationHeaders> {
    await this.ready
    return {
      workspaceId: this.workspaceId,
      'X-CSRF-Token': this.csrfToken,
      'Idempotency-Key': crypto.randomUUID(),
    }
  }

  async channelOptions(): Promise<ChannelOptions> {
    await this.ready
    return { client: this.client, live: this.live, workspaceId: this.workspaceId, csrfToken: this.csrfToken }
  }

  language(): Promise<WorkspaceLanguage> {
    return (this.languageCalls ??= this.channelOptions().then((options) => new WorkspaceLanguage(options)))
  }

  scm(): Promise<WorkspaceScm> {
    return (this.scmCalls ??= this.channelOptions().then((options) => new WorkspaceScm(options)))
  }

  /** The workspace-relative path of a frontend path: `''` for the root, undefined outside it. */
  toRelative(path: string): string | undefined {
    if (path === this.root) return ''
    return path.startsWith(`${this.root}/`) ? path.slice(this.root.length + 1) : undefined
  }

  toAbsolute(relative: string): string {
    return relative === '' || relative === '.' ? this.root : `${this.root}/${relative}`
  }

  /** One session per path, shared by every editor and writer on this page. */
  async acquire(relative: string): Promise<DocumentLease> {
    let entry = this.documents.get(relative)
    if (!entry) {
      const session = this.channelOptions().then((options) => DocumentSession.open({ ...options, resourceId: relative }))
      entry = { session, refs: 0 }
      this.documents.set(relative, entry)
      session.catch(() => this.documents.delete(relative))
    }
    entry.refs += 1
    const held = entry
    const session = await held.session
    let released = false
    return {
      session,
      release: () => {
        if (released) return
        released = true
        held.refs -= 1
        if (held.refs === 0 && this.documents.get(relative) === held) {
          this.documents.delete(relative)
          session.dispose()
        }
      },
    }
  }

  /** Stop the live stream and every shared session. */
  async close(): Promise<void> {
    this.saveCursor()
    for (const { session } of this.documents.values()) void session.then((s) => s.dispose(), () => {})
    this.documents.clear()
    this.live.close()
  }
}
