// Revision coordination over the existing Documents SDK and canonical Loro body.
import type { Theorem } from './client'
import { Mutex } from 'async-mutex'
import { LoroDoc } from 'loro-crdt/base64'
import { describeError, hasStatus, mutate, theorem } from './client'
import { fromBase64, toBase64 } from '../blocks/state'
import {
  contentDigest,
  isEditableNote,
  noteMarkdown,
  reviseNote,
} from './note-canonical'

export interface AppDocuments {
  get: (
    request: Theorem.GetDocumentsRequest,
  ) => Promise<Theorem.DocumentSnapshot>
  snapshot: (
    request: Theorem.SnapshotDocumentsRequest,
  ) => Promise<Theorem.DocumentSnapshot>
  revise: (
    request: Theorem.ReviseDocumentRequest,
  ) => Promise<Theorem.DocumentCommitReceipt>
}

export type AppSnapshot = {
  documentId: string
  title: string
  html: string
  canonical: Uint8Array
  revision: Theorem.DocumentRevision
  saveError?: string
}

export class AppDocument {
  constructor(
    readonly documentId: string,
    private readonly suppliedApi?: AppDocuments,
    private readonly change: typeof mutate = mutate,
  ) {}

  private get api(): AppDocuments {
    return this.suppliedApi ?? theorem().documents
  }

  private current: AppSnapshot | null = null
  private readonly listeners = new Set<() => void>()
  private readonly lock = new Mutex()
  private readonly pending: Uint8Array[] = []

  hasPendingState = (): boolean => this.pending.length > 0

  getSnapshot = (): AppSnapshot | null => this.current
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private publish(snapshot: AppSnapshot): AppSnapshot {
    this.current = snapshot
    for (const listener of this.listeners) listener()
    return snapshot
  }

  private async read(): Promise<AppSnapshot> {
    let snapshot = await this.api.get({
      documentId: this.documentId,
      schema: 'theorem-document/2',
    })
    if (snapshot.canonical.placement !== 'inline') {
      snapshot = await this.api.snapshot({
        documentId: this.documentId,
        schema: 'theorem-document/2',
        expectedPosition: Number(snapshot.summary.revision.position),
        expectedDigest: snapshot.summary.revision.contentDigest,
      })
    }
    if (
      snapshot.summary.documentKind !== 'theorem.app' ||
      snapshot.summary.readOnly
    )
      throw new Error('This document is not an editable App')
    if (snapshot.canonical.placement !== 'inline')
      throw new Error('The App source could not be loaded')
    const canonical = fromBase64(snapshot.canonical.bytesBase64)
    if (
      (await contentDigest(canonical)) !==
      snapshot.summary.revision.contentDigest
    )
      throw new Error('The App source does not match its saved revision')
    if (!isEditableNote(canonical))
      throw new Error('This App uses an unsupported document layout')
    return {
      documentId: this.documentId,
      title: snapshot.summary.title,
      canonical,
      html: noteMarkdown(canonical)!,
      revision: snapshot.summary.revision,
    }
  }

  load(): Promise<AppSnapshot> {
    return this.lock.runExclusive(async () =>
      this.publish({
        ...(await this.read()),
        saveError: this.current?.saveError,
      }),
    )
  }

  private async write(base: AppSnapshot, canonical: Uint8Array): Promise<void> {
    const html = noteMarkdown(canonical)
    if (html === undefined) throw new Error('The App source layout changed')
    const body = {
      title: base.title,
      documentKind: 'theorem.app',
      markdownProjection: html,
      canonical: {
        placement: 'inline' as const,
        bytesBase64: toBase64(canonical),
        size: canonical.length,
        digest: await contentDigest(canonical),
      },
    }
    const receipt = await this.change((headers) =>
      this.api.revise({
        ...headers,
        'If-Match': String(base.revision.position),
        documentIdPath: this.documentId,
        documentId: this.documentId,
        schema: 'theorem-document/2',
        idempotencyKey: headers['Idempotency-Key'],
        expectedRevision: base.revision,
        body,
      }),
    )
    this.publish({
      ...base,
      html,
      canonical,
      revision: receipt.document.revision,
      saveError: undefined,
    })
  }

  private failed(error: unknown): never {
    if (this.current)
      this.publish({
        ...this.current,
        saveError:
          describeError(error,'document'),
      })
    throw error
  }

  async saveSource(
    html: string,
    revision: Theorem.DocumentRevision,
  ): Promise<void> {
    return this.lock.runExclusive(async () => {
      try {
        const base = await this.read()
        if (
          String(base.revision.position) !== String(revision.position) ||
          base.revision.contentDigest !== revision.contentDigest
        )
          throw new Error(
            'This App changed since you started editing. Reload its current source before saving.',
          )
        await this.write(base, reviseNote(base.canonical, html))
      } catch (error) {
        this.failed(error)
      }
    })
  }

  async pushState(update: Uint8Array): Promise<void> {
    this.pending.push(update.slice())
    await this.flush()
  }

  flush(): Promise<void> {
    return this.lock.runExclusive(async () => {
      if (!this.pending.length) return
      const batch = this.pending.slice()
      for (let attempt = 0; ; attempt++) {
        try {
          const base = await this.read()
          const doc = LoroDoc.fromSnapshot(base.canonical)
          for (const update of batch) doc.import(update)
          await this.write(base, doc.export({ mode: 'snapshot' }))
          this.pending.splice(0, batch.length)
          return
        } catch (error) {
          if (hasStatus(error, 409, 412) && attempt < 2) continue
          this.failed(error)
        }
      }
    })
  }
}
