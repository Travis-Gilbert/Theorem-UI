// SOURCING: the SDK's DocumentSession owns every checkout document (revision, pending edits, undo,
// conflicts, reconnect). This module is the registry that gives each open file the numeric id
// OpenIDEA's `doc_*` commands use, answers those commands from the session, and hands the
// editor model a `SessionDocSync` through `DocBackend.createSync` (fork patch P1). One session
// per path is shared by the editor, the file commands and anything else on the page.
// A file in the caller's own state store (a scratch) has no session: the host keeps no authority
// for it (I04 D3). It is held here as text, edited through OpenIDEA's own `DocSync` and
// CodeMirror's own history, and saved with `workspace.files.create` into `root: "state"`.

import type { DocumentInfo } from '@/bindings'
import type { DocBackend, DocSyncHandle, DocSyncHost } from '@/editor/core/backend'
import { ipcBackend } from '@/editor/core/backend'
import { DocSync } from '@/editor/core/sync/DocSync'
import type { DocumentLease } from '../connection'
import { failure } from '../host'
import { languageOf } from '../languages'
import type { SessionHistory } from '../session-extensions'
import { SessionDocSync, sessionState } from '../session-sync'
import { hostState } from '../store'
import { arg, isNumber, isString, type CommandContext, type CommandTable } from './context'
import type { DocumentSession, TextChange } from '@theoremharness/sdk'

/** Larger than this the editor drops heavy features, as the desktop backend's size limit does. */
const LARGE_TEXT = 2_000_000

interface SessionDoc {
  kind: 'session'
  id: number
  path: string
  relative: string
  lease: DocumentLease
  refs: number
  sync: SessionDocSync | undefined
  lastDirty: boolean
  detach: () => void
}

/** A document in the state store: its text, what was last saved, and a version this registry counts. */
interface StateDoc {
  kind: 'state'
  id: number
  path: string
  relative: string
  text: string
  saved: string
  version: number
  refs: number
  sync: DocSync | undefined
  lastDirty: boolean
}

type OpenDoc = SessionDoc | StateDoc

type Change = { from: number; to: number; insert: string }

const isDirty = (doc: OpenDoc) => (doc.kind === 'session' ? doc.lease.session.dirty : doc.text !== doc.saved)

const lineEndingOf = (text: string) => (text.includes('\r\n') ? 'crLf' : 'lf')

export class DocumentRegistry {
  private nextId = 1
  private readonly byId = new Map<number, OpenDoc>()
  private readonly byPath = new Map<string, OpenDoc>()
  private readonly opening = new Map<string, Promise<OpenDoc>>()

  constructor(private readonly context: CommandContext) {}

  /** Unsaved or unaccepted work on this page: what a tab close would lose. */
  hasUnsavedWork(): boolean {
    return [...this.byId.values()].some((d) => isDirty(d) || (d.kind === 'session' && d.lease.session.pending))
  }

  private get(id: number): OpenDoc {
    const doc = this.byId.get(id)
    if (!doc) throw failure('notFound', `document ${id} is not open`)
    return doc
  }

  private info(doc: OpenDoc): DocumentInfo {
    const text = doc.kind === 'session' ? doc.lease.session.text : doc.text
    return {
      id: doc.id,
      path: doc.path,
      text,
      version: doc.kind === 'session' ? doc.lease.session.revision : doc.version,
      language: languageOf(doc.path, text.slice(0, text.indexOf('\n') < 0 ? 200 : text.indexOf('\n'))),
      encoding: 'UTF-8',
      lineEnding: lineEndingOf(text),
      readOnly: false,
      dirty: isDirty(doc),
      ...(text.length > LARGE_TEXT ? { large: true } : {}),
    }
  }

  async open(path: string): Promise<DocumentInfo> {
    return this.info(await this.acquire(path))
  }

  /** The open document for `path`, opening it once however many callers ask at the same time. */
  private async acquire(path: string): Promise<OpenDoc> {
    const existing = this.byPath.get(path)
    if (existing) {
      existing.refs += 1
      return existing
    }
    const inFlight = this.opening.get(path)
    if (inFlight) {
      const doc = await inFlight
      doc.refs += 1
      return doc
    }
    const attaching = this.attach(path).finally(() => this.opening.delete(path))
    this.opening.set(path, attaching)
    return attaching
  }

  private async attach(path: string): Promise<OpenDoc> {
    const located = this.context.connection.locate(path)
    if (located === undefined || located.relative === '') {
      throw failure('permissionDenied', `${path} is outside the workspace ${this.context.connection.root}`)
    }
    const { relative } = located
    if (located.root === 'state') return this.attachState(path, relative)
    const lease = await this.context.connection.acquire(relative)
    const doc: SessionDoc = {
      kind: 'session',
      id: this.nextId++,
      path,
      relative,
      lease,
      refs: 1,
      sync: undefined,
      lastDirty: lease.session.dirty,
      detach: () => {},
    }
    const { session } = lease
    hostState.setDoc(path, sessionState(session))
    doc.detach = session.onStateChange(() => this.stateChanged(doc))
    this.byId.set(doc.id, doc)
    this.byPath.set(path, doc)
    return doc
  }

  private async attachState(path: string, relative: string): Promise<StateDoc> {
    const { connection } = this.context
    const file = (await connection.client.ide.workspace.filesRead(
      { ...(await connection.headers()), body: { path: relative } },
      { additionalBodyParameters: { root: 'state' } },
    )) as { encoding: 'utf8' | 'base64'; contents: string }
    if (file.encoding !== 'utf8') throw failure('invalidInput', `${path} is not a text file`)
    const doc: StateDoc = {
      kind: 'state',
      id: this.nextId++,
      path,
      relative,
      text: file.contents,
      saved: file.contents,
      version: 0,
      refs: 1,
      sync: undefined,
      lastDirty: false,
    }
    this.byId.set(doc.id, doc)
    this.byPath.set(path, doc)
    return doc
  }

  private stateChanged(doc: SessionDoc): void {
    const state = doc.sync?.state() ?? sessionState(doc.lease.session)
    hostState.setDoc(doc.path, state)
    this.dirtyChanged(doc, state.dirty)
  }

  private dirtyChanged(doc: OpenDoc, dirty: boolean): void {
    if (dirty === doc.lastDirty) return
    doc.lastDirty = dirty
    this.context.emit({ type: 'docDirty', doc: doc.id, dirty })
  }

  async close(id: number): Promise<void> {
    const doc = this.byId.get(id)
    if (!doc) return
    doc.refs -= 1
    if (doc.refs > 0) return
    this.byId.delete(id)
    this.byPath.delete(doc.path)
    doc.sync?.dispose()
    if (doc.kind === 'state') return
    doc.detach()
    hostState.clearDoc(doc.path)
    doc.lease.release()
  }

  snapshot(id: number): DocumentInfo {
    return this.info(this.get(id))
  }

  async save(id: number): Promise<void> {
    const doc = this.get(id)
    // `save` waits for the edits in flight first.
    if (doc.kind === 'session') return doc.lease.session.save()
    const text = doc.text
    const { connection } = this.context
    await connection.client.ide.workspace.filesCreate({
      ...(await connection.headers()),
      body: { path: doc.relative, root: 'state', contents: text },
    })
    doc.saved = text
    this.dirtyChanged(doc, isDirty(doc))
  }

  async saveAll(): Promise<void> {
    await Promise.all([...this.byId.values()].filter(isDirty).map((d) => this.save(d.id)))
  }

  /**
   * A change set against the version the caller read, applied as an edit of this client. The
   * caller's offsets are valid only against that version, so a newer revision or an unaccepted
   * local edit is `outOfSync` and the caller reads a snapshot again.
   */
  async edit(id: number, baseVersion: number, changes: Change[]): Promise<number> {
    const doc = this.get(id)
    if (doc.kind === 'state') {
      // Not the editor's own edit (that comes through its DocSync): the editor is told, as the
      // desktop backend tells it, with `docPatched`.
      const version = this.editState(doc, baseVersion, changes)
      this.context.emit({ type: 'docPatched', doc: doc.id, baseVersion, version, changes })
      return version
    }
    const { session } = doc.lease
    if (baseVersion !== session.revision || session.pending) {
      throw failure('outOfSync', `base ${baseVersion}, document at ${session.revision}${session.pending ? ' with edits pending' : ''}`)
    }
    const edits: TextChange[] = changes.map((c) => ({ start: c.from, end: c.to, insert: c.insert }))
    if (doc.sync) doc.sync.programmatic(edits)
    else session.edit(edits)
    await session.flushed()
    return session.revision
  }

  /** A change set in UTF-16 offsets against `baseVersion`, applied last to first so earlier offsets hold. */
  private editState(doc: StateDoc, baseVersion: number, changes: Change[]): number {
    if (baseVersion !== doc.version) throw failure('outOfSync', `base ${baseVersion}, document at ${doc.version}`)
    let text = doc.text
    for (const change of [...changes].sort((a, b) => b.from - a.from)) {
      if (!(change.from >= 0 && change.from <= change.to && change.to <= text.length)) {
        throw failure('invalidInput', `change ${change.from}..${change.to} is outside a text of ${text.length}`)
      }
      text = text.slice(0, change.from) + change.insert + text.slice(change.to)
    }
    doc.text = text
    doc.version += 1
    this.dirtyChanged(doc, isDirty(doc))
    return doc.version
  }

  /**
   * The editor model's sync for a document just opened: the session, joined to CodeMirror; for a
   * state document, OpenIDEA's own `DocSync` over this registry's `edit` and `snapshot`.
   */
  createSync(info: DocumentInfo, host: DocSyncHost): DocSyncHandle {
    const doc = this.get(info.id)
    doc.sync?.dispose()
    if (doc.kind === 'state') {
      const sync = new DocSync(
        info.version,
        info.text,
        {
          // The editor's own edits are not echoed back to it: DocSync would apply them twice.
          edit: async (base, changes) => this.editState(doc, base, changes),
          snapshot: async () => ({ text: doc.text, version: doc.version }),
        },
        host,
      )
      doc.sync = sync
      return sync
    }
    const { session } = doc.lease
    const sync = new SessionDocSync(session, {
      applyRemote: (changes) => host.applyRemote(changes),
      onDiscarded: (reason) => host.onDiscarded?.(reason),
      onState: () => this.stateChanged(doc),
      onConflict: (conflict) =>
        hostState.setConflict(doc.path, {
          revision: conflict.revision,
          diskDeleted: conflict.disk_deleted,
          resolve: async (keep) => {
            await session.resolveConflict(keep)
            hostState.clearConflict(doc.path)
          },
        }),
    })
    doc.sync = sync
    return sync
  }

  session(path: string): DocumentSession | undefined {
    const doc = this.byPath.get(path)
    return doc?.kind === 'session' ? doc.lease.session : undefined
  }

  /** The text an open document shows, unsaved edits included. */
  text(path: string): string | undefined {
    const doc = this.byPath.get(path)
    if (!doc) return undefined
    return doc.kind === 'session' ? doc.lease.session.text : doc.text
  }

  /**
   * Undo and redo of an open document for its editor; the sync it routes to exists once the editor
   * model made it. A state document has no session, so CodeMirror's own history serves it.
   */
  history(id: number): SessionHistory | undefined {
    const doc = this.byId.get(id)
    if (doc?.kind !== 'session') return undefined
    return { undo: () => doc.sync?.undo() ?? false, redo: () => doc.sync?.redo() ?? false }
  }
}

export function documentCommands(registry: DocumentRegistry): CommandTable {
  return {
    doc_open: (args) => registry.open(arg(args, 'path', isString)),
    doc_close: async (args) => {
      await registry.close(arg(args, 'doc', isNumber))
      return null
    },
    doc_snapshot: (args) => registry.snapshot(arg(args, 'doc', isNumber)),
    doc_save: async (args) => {
      await registry.save(arg(args, 'doc', isNumber))
      return null
    },
    doc_save_all: async () => {
      await registry.saveAll()
      return null
    },
    // Missed external changes arrive through the live stream; the session catches up from history.
    doc_sync_from_disk: async () => null,
    doc_edit: (args) =>
      registry.edit(
        arg(args, 'doc', isNumber),
        arg(args, 'baseVersion', isNumber),
        (args.changes as { changes: Change[] }).changes,
      ),
    doc_ui_mode: async () => null,
    doc_set_encoding: () => {
      throw failure('unavailable', 'The workspace stores text as UTF-8; another encoding is not available')
    },
    doc_set_line_ending: () => {
      throw failure('unavailable', "The workspace keeps each file's own line endings; changing them is not available")
    },
  }
}

/** The editor's backend: OpenIDEA's IPC backend (every command answered by this host) plus the session sync. */
export function sessionBackend(registry: DocumentRegistry): DocBackend {
  return { ...ipcBackend, createSync: (info, host) => registry.createSync(info, host) }
}
