// FIXTURE (evidence grade: fixture). An in-process document authority and live stream that follow
// the host's revision contract: linear revisions, stale bases refused with `stale_revision`,
// operation ids deduplicated, edits spliced in Unicode scalars, `document.changed` delivered in
// order after a random delay. Nothing here talks to a real host.
//
// SOURCING: lifted from the SDK's own test, `packages/theorem-sdk/tests/document-session.test.ts`
// (Theorem repo, base ff73813055). Divergences: it imports the published package instead of
// `../src`; the live stream keeps its resync listeners so a test can drop and restore the
// connection; the authority can report `document.conflict` and implements `reconcile`.

import { DocumentSession, type Theorem, type TheoremClient, type WorkspaceLive } from '@theoremharness/sdk'

export type Record = Theorem.IdeRevisionRecord & { workspace_id: string; resource_id: string }

const refusal = (code: string) => Object.assign(new Error(code), { statusCode: 409, body: { code } })
const tick = () => new Promise((resolve) => setTimeout(resolve, Math.random() * 3))

/** Splice scalar edits the way the host does: ascending, against the base text. */
function applyScalar(text: string, edits: Theorem.IdeTextEdit[]) {
  const chars = [...text]
  const stored = edits.map((edit) => ({
    start: edit.start,
    end: edit.end ?? edit.start,
    insert: edit.insert ?? '',
    removed: chars.slice(edit.start, edit.end ?? edit.start).join(''),
  }))
  for (const edit of [...stored].reverse()) {
    chars.splice(edit.start, edit.end - edit.start, ...edit.insert)
  }
  return { text: chars.join(''), stored }
}

/** An in-process authority: linear revisions, stale bases refused, ids deduped. */
export class Authority {
  text: string
  /** The checkout's text, when it differs from the authority's after an external write. */
  disk: string
  records: Record[] = []
  readonly lives: FakeLive[] = []
  /** The revision whose text is on disk. */
  saved = 0
  /** How many save requests the host received, clean document or not. */
  saveRequests = 0
  /** Commit the next edit but fail its reply, as a dropped connection would. */
  dropNextReply = false
  /** Hold each edit's reply until every live stream has delivered its record. */
  replyAfterLive = false
  /** Edits the host refused after seeing them, by operation id. */
  readonly edits: { base: number; edits: Theorem.IdeTextEdit[] }[] = []
  readonly reconciles: { resource_id: string; keep: string; expected_revision: number }[] = []

  constructor(text: string) {
    this.text = text
    this.disk = text
  }

  get revision() {
    return this.records.length
  }

  private commit(edits: Theorem.IdeTextEdit[], operationId: string, kind = 'edit'): Record {
    const { text, stored } = applyScalar(this.text, edits)
    this.text = text
    const record: Record = {
      document_id: 'doc',
      workspace_id: 'ws',
      resource_id: 'a.txt',
      revision: this.revision + 1,
      parent_revision: this.revision,
      content_hash: '',
      kind,
      operation_id: operationId,
      actor: 'a',
      provenance: 'test',
      path: 'a.txt',
      edits: stored,
    } as Record
    this.records.push(record)
    for (const live of this.lives) live.deliver(record)
    return record
  }

  /** The checkout changed under unsaved edits (a `git checkout`, another tool). */
  externalWrite(disk: string, disk_deleted = false) {
    this.disk = disk
    for (const live of this.lives) live.emit('document.conflict', { document_id: 'doc', resource_id: 'a.txt', disk_deleted, revision: this.revision })
  }

  client(): TheoremClient {
    const documentSessions = {
      open: async () => ({
        document_id: 'doc',
        revision: this.revision,
        content_hash: `h${this.revision}`,
        disk_hash: this.disk === this.text ? `h${this.revision}` : 'other',
        text: this.text,
      }),
      edit: async (request: Theorem.IdeDocumentEdit) => {
        await tick()
        if (this.records.some((record) => record.operation_id === request.operation_id)) {
          throw refusal('duplicate_operation')
        }
        if (request.base_revision !== this.revision) throw refusal('stale_revision')
        this.edits.push({ base: request.base_revision as number, edits: request.edits ?? [] })
        const record = this.commit(request.edits ?? [], request.operation_id as string)
        if (this.replyAfterLive) await Promise.all(this.lives.map((live) => live.idle()))
        if (this.dropNextReply) {
          this.dropNextReply = false
          throw new Error('socket hang up')
        }
        return { document_id: 'doc', revision: record.revision, content_hash: '', text: this.text }
      },
      history: async (request: { body: { from_revision: number } }) => {
        await tick()
        return { revisions: this.records.filter((r) => r.revision >= request.body.from_revision) }
      },
      head: async () => ({ document_id: 'doc', revision: this.revision, text: this.text }),
      save: async (request: { body: { revision: number } }) => {
        this.saveRequests += 1
        this.saved = request.body.revision
        this.disk = this.text
        for (const live of this.lives) {
          live.emit('document.saved', { document_id: 'doc', resource_id: 'a.txt', revision: this.saved })
        }
        return {}
      },
      reconcile: async (request: { body: { resource_id: string; keep: string; expected_revision: number } }) => {
        this.reconciles.push(request.body)
        if (request.body.expected_revision !== this.revision) throw refusal('stale_revision')
        if (request.body.keep === 'disk') {
          const length = [...this.text].length
          this.commit([{ start: 0, end: length, insert: this.disk } as Theorem.IdeTextEdit], `reconcile-${this.revision}`, 'external')
        } else {
          this.disk = this.text
        }
        this.saved = this.revision
        // The host publishes `document.saved` whenever the saved revision moves, whatever moved
        // it (apps/theorem-ide-host/src/session.rs, the `head.saved` comparison).
        for (const live of this.lives) {
          live.emit('document.saved', { document_id: 'doc', resource_id: 'a.txt', revision: this.saved })
        }
        return {}
      },
    }
    return { documentSessions } as unknown as TheoremClient
  }

  live(): FakeLive {
    const live = new FakeLive()
    this.lives.push(live)
    return live
  }

  async open(live: FakeLive = this.live()) {
    const session = await DocumentSession.open({
      client: this.client(),
      live: live as unknown as WorkspaceLive,
      workspaceId: 'ws',
      resourceId: 'a.txt',
      csrfToken: 'csrf',
    })
    return { session, live }
  }
}

/** Delivers document.changed in order, each after a random delay. */
export class FakeLive {
  private listeners: ((event: { data: Record }) => Promise<void> | void)[] = []
  private others = new Map<string, ((event: { data: any }) => void)[]>()
  private resyncs: (() => Promise<void> | void)[] = []
  private chain: Promise<void> = Promise.resolve()
  held = false
  private heldRecords: Record[] = []

  on(kind: string, listener: (event: { data: any }) => Promise<void> | void) {
    if (kind === 'document.changed') this.listeners.push(listener)
    else this.others.set(kind, [...(this.others.get(kind) ?? []), listener as (event: { data: any }) => void])
    return () => {}
  }

  emit(kind: string, data: unknown) {
    for (const listener of this.others.get(kind) ?? []) listener({ data })
  }

  onResync(listener: () => Promise<void> | void) {
    this.resyncs.push(listener)
    return () => {}
  }

  /** The stream reconnected after a gap: listeners read what they missed. */
  async resync() {
    for (const listener of this.resyncs) await listener()
  }

  deliver(record: Record) {
    if (this.held) {
      this.heldRecords.push(record)
      return
    }
    this.chain = this.chain.then(async () => {
      await tick()
      for (const listener of this.listeners) await listener({ data: record })
    })
  }

  /** Stop delivering, as a dropped stream would. */
  hold() {
    this.held = true
  }

  /** Resume; `lose` discards what arrived while held. */
  release(lose: boolean) {
    this.held = false
    const records = this.heldRecords.splice(0)
    if (!lose) for (const record of records) this.deliver(record)
  }

  idle() {
    return this.chain
  }
}

/** Wait until every session has sent its edits and reached the authority's revision. */
export async function settle(authority: Authority, sessions: { session: DocumentSession; live: FakeLive }[]) {
  for (let round = 0; round < 80; round += 1) {
    await Promise.all(sessions.map((s) => s.session.flushed()))
    await Promise.all(sessions.map((s) => s.live.idle()))
    await new Promise((resolve) => setTimeout(resolve, 5))
    if (sessions.every((s) => !s.session.pending && s.session.revision === authority.revision)) return
  }
  throw new Error('sessions did not settle')
}
