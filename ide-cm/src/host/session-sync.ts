// SOURCING: @theoremharness/sdk DocumentSession — the operation-transform client, one in-flight
// operation, the per-client invertible undo stack, stale-revision recovery and reconnect catch-up
// all live there, and the UTF-16 to Unicode-scalar conversion is the SDK's `utf16ToScalar`. This
// file only joins a CodeMirror document to a session: the editor owns text, selection and input
// locally, the session owns the authoritative revision. @codemirror/state ChangeSet/Text carry
// the editor side.
//
// It replaces OpenIDEA's `sync/DocSync` (a second operation-transform client over its own
// `doc_edit` protocol) with the same surface `DocModel` uses: `localText`, `local`, `whenIdle`,
// `dispose`.

import { ChangeSet, Text } from '@codemirror/state'
import type { DocumentConflict, DocumentSession, TextChange } from '@theoremharness/sdk'

/** What the editor model gives the sync to reach its views. */
export interface SessionSyncHost {
  /** Apply a change set (in local-text coordinates) to every view, annotated as remote. */
  applyRemote(changes: ChangeSet): void
  /** The authority refused local edits for good; they were dropped and its text shown. */
  onDiscarded?(reason: unknown): void
  /** Authority conflict: the checkout changed under unsaved edits. */
  onConflict?(conflict: DocumentConflict): void
  /** The session's `pending`, `revision` or `dirty` changed. */
  onState?(state: SessionSyncState): void
}

export interface SessionSyncState {
  revision: number
  pending: boolean
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
}

/** Where a session stands, for the UI and for dirty events. */
export function sessionState(session: DocumentSession): SessionSyncState {
  return {
    revision: session.revision,
    pending: session.pending,
    dirty: session.dirty,
    canUndo: session.canUndo,
    canRedo: session.canRedo,
  }
}

/** Typing within this window, and contiguous with the last edit, shares one undo step. */
const MERGE_WINDOW_MS = 500

/**
 * The editor's change set as session changes. Both use UTF-16 offsets against the text before
 * the set, so no unit conversion happens here: the session converts to scalars with the SDK's
 * `utf16ToScalar`. A change that would split a surrogate pair is refused by the session
 * (`RangeError`) instead of being sent to the host; `scalarBoundaryFilter` keeps the editor from
 * producing one.
 */
export function toSessionChanges(changes: ChangeSet): TextChange[] {
  const out: TextChange[] = []
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    out.push({ start: fromA, end: toA, insert: inserted.toString() })
  })
  return out
}

/** Session changes (UTF-16, against the previous text) as an editor change set. */
export function toChangeSet(changes: readonly TextChange[], docLength: number): ChangeSet {
  return ChangeSet.of(
    changes.map((change) => ({ from: change.start, to: change.end, insert: change.insert })),
    docLength,
  )
}

export class SessionDocSync {
  /** The text the editor shows: authoritative text plus pending local edits. */
  localText: Text

  private readonly detach: (() => void)[] = []
  private disposed = false
  private lastEdit: { at: number; start: number; end: number } | undefined

  constructor(
    readonly session: DocumentSession,
    private readonly host: SessionSyncHost,
    private readonly now: () => number = () => performance.now(),
  ) {
    // Split on \n only, as `Text.toString` joins: a \r stays a character in its line, so an
    // offset in the editor is an offset in the host's text.
    this.localText = Text.of(session.text.split('\n'))
    this.detach.push(
      session.onRemoteChange((changes, text) => this.receive(changes, text)),
      session.onStateChange(() => this.host.onState?.(this.state())),
      session.onConflict((conflict) => this.host.onConflict?.(conflict)),
      session.onError((error) => this.host.onDiscarded?.(error)),
    )
  }

  /** The last authority revision applied. */
  get serverVersion(): number {
    return this.session.revision
  }

  /** True once the authority accepted every local edit. */
  get idle(): boolean {
    return !this.session.pending
  }

  state(): SessionSyncState {
    return sessionState(this.session)
  }

  /** Record a change made in the editor (coordinates of the current local text). */
  local(changes: ChangeSet): void {
    if (this.disposed || changes.empty) return
    const edits = toSessionChanges(changes)
    const first = edits[0]!
    const at = this.now()
    const contiguous =
      this.lastEdit !== undefined &&
      at - this.lastEdit.at < MERGE_WINDOW_MS &&
      edits.length === 1 &&
      (first.start === this.lastEdit.end || first.end === this.lastEdit.start)
    const before = this.localText
    this.localText = changes.apply(before)
    try {
      this.session.edit(edits, { merge: contiguous })
    } catch (error) {
      // The session refused the edit (it would split a surrogate pair, or overlap another change)
      // and kept its text. The editor already shows the edit, and the model is still mirroring it
      // to its other views: once it has, put the session's text back everywhere.
      this.lastEdit = undefined
      queueMicrotask(() => {
        this.apply([{ start: 0, end: this.localText.length, insert: this.session.text }])
        this.host.onDiscarded?.(error)
      })
      return
    }
    // Where a single edit left the text, in coordinates after the change.
    this.lastEdit = { at, start: first.start, end: first.start + first.insert.length }
  }

  /**
   * A change made by the host on the editor's behalf (a refactor, `doc_edit`): sent to the
   * session as this client's edit and shown in every view as if another writer made it. The
   * session refuses a change that would split a surrogate pair before anything is shown.
   */
  programmatic(changes: TextChange[]): void {
    if (this.disposed) return
    this.session.edit(changes)
    this.lastEdit = undefined
    this.apply(changes)
  }

  /** Resolves once the authority has accepted every local edit. */
  whenIdle(): Promise<void> {
    return this.session.flushed()
  }

  /** Revert this client's last edit step; false when there is none. */
  undo(): boolean {
    return this.history(this.session.undo())
  }

  redo(): boolean {
    return this.history(this.session.redo())
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const detach of this.detach) detach()
  }

  private history(changes: TextChange[]): boolean {
    if (changes.length === 0) return false
    this.lastEdit = undefined
    this.apply(changes)
    return true
  }

  private receive(changes: TextChange[], text: string): void {
    this.apply(changes)
    // The editor and the session must hold the same text. If they do not, show the session's.
    if (this.localText.length !== text.length || this.localText.toString() !== text) {
      const whole = [{ start: 0, end: this.localText.length, insert: text }]
      this.apply(whole)
    }
  }

  private apply(changes: TextChange[]): void {
    if (this.disposed) return
    const cs = toChangeSet(changes, this.localText.length)
    this.localText = cs.apply(this.localText)
    this.host.applyRemote(cs)
  }
}
