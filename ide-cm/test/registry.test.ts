// FIXTURE (evidence grade: fixture). DocumentRegistry over the in-process authority
// (test/fixtures/authority.ts): the numeric ids OpenIDEA's `doc_*` commands use, shared sessions,
// `doc_edit` against a base version, dirty events, the editor sync's conflict wiring, and
// catching up after a gap. The session semantics themselves (offsets, undo, reconnect) are in
// session-sync.test.ts; this file is about what the registry adds on top.

import { Text } from '@codemirror/state'
import { afterEach, describe, expect, test } from 'bun:test'
import type { WorkspaceConnection } from '../src/host/connection'
import { DocumentRegistry, documentCommands, sessionBackend } from '../src/host/commands/doc'
import type { EmittedEvent } from '../src/host/commands/context'
import { useHostState } from '../src/host/store'
import { Authority, settle } from './fixtures/authority'
import { memoryStorage } from './fixtures/host'

const ROOT = '/demo'
const disposers: (() => void)[] = []

/** What a synchronous call throws; the host's failures are plain objects, not Errors. */
const thrown = (call: () => unknown): unknown => {
  try {
    call()
  } catch (error) {
    return error
  }
  return undefined
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  useHostState.setState({ docs: {}, conflicts: {} })
})

/** A registry whose connection serves one authority per workspace-relative path. */
async function harness(files: Record<string, string> = { 'a.txt': 'hello' }) {
  const authorities = new Map(Object.entries(files).map(([path, text]) => [path, new Authority(text)]))
  const live = new Map([...authorities].map(([path, authority]) => [path, authority.live()]))
  const counts = { acquired: 0, released: 0 }
  const events: EmittedEvent[] = []
  const connection = {
    root: ROOT,
    toRelative: (path: string) => (path === ROOT ? '' : path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : undefined),
    locate: (path: string) => {
      const relative = path === ROOT ? '' : path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : undefined
      return relative === undefined ? undefined : { root: 'workspace', relative }
    },
    acquire: async (relative: string) => {
      counts.acquired += 1
      const authority = authorities.get(relative)
      if (!authority) throw Object.assign(new Error('not found'), { statusCode: 404 })
      const { session } = await authority.open(live.get(relative)!)
      disposers.push(() => session.dispose())
      return {
        session,
        release: () => {
          counts.released += 1
          session.dispose()
        },
      }
    },
  } as unknown as WorkspaceConnection
  const registry = new DocumentRegistry({ connection, emit: (event) => void events.push(event), storage: memoryStorage() })
  return { registry, authorities, live, counts, events, authority: authorities.get('a.txt')! }
}

describe('opening and closing', () => {
  test('open answers the document the frontend expects: id, text, version, language, line ending', async () => {
    const h = await harness({ 'a.txt': 'hello', 'main.rs': 'fn main() {}\r\n' })
    const a = await h.registry.open(`${ROOT}/a.txt`)
    expect(a).toMatchObject({ path: '/demo/a.txt', text: 'hello', version: 0, encoding: 'UTF-8', lineEnding: 'lf', readOnly: false, dirty: false })
    const b = await h.registry.open(`${ROOT}/main.rs`)
    expect(b).toMatchObject({ language: 'rust', lineEnding: 'crLf' })
    expect(b.id).not.toBe(a.id)
  })

  test('a path outside the workspace, and the root itself, are permission-denied; a missing file reports the host error', async () => {
    const h = await harness()
    await expect(h.registry.open('/elsewhere/a.txt')).rejects.toMatchObject({ kind: 'permissionDenied' })
    await expect(h.registry.open(ROOT)).rejects.toMatchObject({ kind: 'permissionDenied' })
    await expect(h.registry.open(`${ROOT}/missing.txt`)).rejects.toMatchObject({ statusCode: 404 })
    expect(await h.registry.open(`${ROOT}/a.txt`)).toMatchObject({ text: 'hello' })
  })

  test('two opens at once share one session, and it is released only when the last close arrives', async () => {
    const h = await harness()
    const [a, b] = await Promise.all([h.registry.open(`${ROOT}/a.txt`), h.registry.open(`${ROOT}/a.txt`)])
    expect(b.id).toBe(a.id)
    expect(h.counts.acquired).toBe(1)
    await h.registry.close(a.id)
    expect(h.registry.snapshot(a.id).text).toBe('hello')
    expect(h.counts.released).toBe(0)
    await h.registry.close(a.id)
    expect(h.counts.released).toBe(1)
    expect(thrown(() => h.registry.snapshot(a.id))).toMatchObject({ kind: 'notFound' })
    await h.registry.close(a.id)
    expect(h.counts.released).toBe(1)
  })

  test('a later open of an open document shares it too, and each open needs its own close', async () => {
    const h = await harness()
    const first = await h.registry.open(`${ROOT}/a.txt`)
    const second = await h.registry.open(`${ROOT}/a.txt`)
    expect(second.id).toBe(first.id)
    expect(h.counts.acquired).toBe(1)
    await h.registry.close(first.id)
    expect(h.counts.released).toBe(0)
    await h.registry.close(first.id)
    expect(h.counts.released).toBe(1)
  })

  test('closing clears what the host state held for the document', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    expect(useHostState.getState().docs[info.path]).toMatchObject({ revision: 0, pending: false, dirty: false })
    await h.registry.close(info.id)
    expect(useHostState.getState().docs[info.path]).toBeUndefined()
  })
})

describe('doc_edit against a base version', () => {
  test('an edit made against the current version is accepted and moves the revision', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    expect(await h.registry.edit(info.id, 0, [{ from: 5, to: 5, insert: ' world' }])).toBe(1)
    expect(h.authority.text).toBe('hello world')
    expect(h.registry.snapshot(info.id)).toMatchObject({ text: 'hello world', version: 1, dirty: true })
  })

  test('a stale base is outOfSync and sends nothing; the current base is accepted in the same document', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    await h.registry.edit(info.id, 0, [{ from: 0, to: 0, insert: '>' }])
    const sent = h.authority.edits.length
    await expect(h.registry.edit(info.id, 0, [{ from: 0, to: 0, insert: '!' }])).rejects.toMatchObject({ kind: 'outOfSync' })
    expect(h.authority.edits.length).toBe(sent)
    await h.registry.edit(info.id, 1, [{ from: 0, to: 0, insert: '!' }])
    expect(h.authority.text).toBe('!>hello')
  })

  test('an edit while local edits are still unaccepted is outOfSync, even at the current revision', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    const session = h.registry.session(info.path)!
    session.edit([{ start: 0, end: 0, insert: 'typed ' }])
    expect(session.pending).toBe(true)
    await expect(h.registry.edit(info.id, session.revision, [{ from: 0, to: 0, insert: 'x' }])).rejects.toMatchObject({ kind: 'outOfSync' })
    await session.flushed()
    await h.registry.edit(info.id, session.revision, [{ from: 0, to: 0, insert: 'x' }])
    expect(h.authority.text).toBe('xtyped hello')
  })

  test('offsets are the document text\'s UTF-16 offsets: an edit after an emoji lands on the host\'s scalar offset', async () => {
    const h = await harness({ 'a.txt': '😀ab' })
    const info = await h.registry.open(`${ROOT}/a.txt`)
    await h.registry.edit(info.id, 0, [{ from: 2, to: 3, insert: 'Z' }])
    expect(h.authority.text).toBe('😀Zb')
    expect(h.authority.edits[0]!.edits[0]).toMatchObject({ start: 1, end: 2 })
  })

  test('an edit that would split a surrogate pair is refused before anything is sent', async () => {
    const h = await harness({ 'a.txt': '😀ab' })
    const info = await h.registry.open(`${ROOT}/a.txt`)
    await expect(h.registry.edit(info.id, 0, [{ from: 1, to: 1, insert: 'x' }])).rejects.toBeInstanceOf(RangeError)
    expect(h.authority.edits.length).toBe(0)
    expect(h.authority.text).toBe('😀ab')
    await h.registry.edit(info.id, 0, [{ from: 2, to: 2, insert: 'x' }])
    expect(h.authority.text).toBe('😀xab')
  })

  test('combining characters are separate scalars: the mark can be removed alone', async () => {
    const h = await harness({ 'a.txt': 'éx' })
    const info = await h.registry.open(`${ROOT}/a.txt`)
    await h.registry.edit(info.id, 0, [{ from: 1, to: 2, insert: '' }])
    expect(h.authority.text).toBe('ex')
  })

  test('edits at the first and last offset', async () => {
    const h = await harness({ 'a.txt': 'mid' })
    const info = await h.registry.open(`${ROOT}/a.txt`)
    await h.registry.edit(info.id, 0, [{ from: 0, to: 0, insert: '<' }])
    await h.registry.edit(info.id, 1, [{ from: 4, to: 4, insert: '>' }])
    expect(h.authority.text).toBe('<mid>')
    await expect(h.registry.edit(info.id, 2, [{ from: 6, to: 6, insert: '?' }])).rejects.toBeDefined()
    expect(h.authority.text).toBe('<mid>')
  })
})

describe('dirty, save and unsaved work', () => {
  test('docDirty is announced when the document becomes dirty and when it is saved, and only then', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    expect(h.registry.hasUnsavedWork()).toBe(false)
    await h.registry.edit(info.id, 0, [{ from: 0, to: 0, insert: 'a' }])
    await h.registry.edit(info.id, 1, [{ from: 0, to: 0, insert: 'b' }])
    expect(h.registry.hasUnsavedWork()).toBe(true)
    await h.registry.save(info.id)
    expect(h.authority.saved).toBe(2)
    expect(h.registry.hasUnsavedWork()).toBe(false)
    expect(h.events.filter((e) => e.type === 'docDirty')).toEqual([
      { type: 'docDirty', doc: info.id, dirty: true },
      { type: 'docDirty', doc: info.id, dirty: false },
    ])
    expect(useHostState.getState().docs[info.path]).toMatchObject({ revision: 2, dirty: false })
  })

  test('saving a document the checkout already holds sends nothing; an edit makes the next save real', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    await h.registry.save(info.id)
    expect(h.authority.saveRequests).toBe(0)
    await h.registry.edit(info.id, 0, [{ from: 5, to: 5, insert: '!' }])
    await h.registry.save(info.id)
    expect(h.authority.saveRequests).toBe(1)
    expect(h.authority.disk).toBe('hello!')
    await h.registry.save(info.id)
    expect(h.authority.saveRequests).toBe(1)
  })

  test('saveAll saves every dirty document and leaves the clean one alone', async () => {
    const h = await harness({ 'a.txt': 'one', 'b.txt': 'two' })
    const a = await h.registry.open(`${ROOT}/a.txt`)
    await h.registry.open(`${ROOT}/b.txt`)
    await h.registry.edit(a.id, 0, [{ from: 0, to: 0, insert: '!' }])
    await h.registry.saveAll()
    expect(h.authorities.get('a.txt')!.saved).toBe(1)
    expect(h.authorities.get('a.txt')!.saveRequests).toBe(1)
    expect(h.authorities.get('b.txt')!.saveRequests).toBe(0)
    expect(h.registry.hasUnsavedWork()).toBe(false)
  })
})

describe('the editor sync and an external modification', () => {
  const host = () => {
    const shown: string[] = []
    let text = Text.of([''])
    return {
      shown,
      discarded: [] as unknown[],
      applyRemote(changes: import('@codemirror/state').ChangeSet) {
        text = changes.apply(text)
        shown.push(text.toString())
      },
      onDiscarded(reason: unknown) {
        this.discarded.push(reason)
      },
      seed(initial: string) {
        text = Text.of(initial.split('\n'))
      },
      /** The user types: the view shows the change, then the sync is told, as the editor model does. */
      type(sync: { local(changes: import('@codemirror/state').ChangeSet): void }, changes: import('@codemirror/state').ChangeSet) {
        text = changes.apply(text)
        sync.local(changes)
      },
      get text() {
        return text.toString()
      },
    }
  }

  test('a conflict reaches the host state with a resolver; keeping the disk text puts it into the editor', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    const view = host()
    view.seed(info.text)
    h.registry.createSync(info, view)
    await h.registry.edit(info.id, 0, [{ from: 0, to: 0, insert: 'mine ' }])
    h.authority.externalWrite('disk text')
    const conflict = useHostState.getState().conflicts[info.path]!
    expect(conflict).toMatchObject({ revision: 1, diskDeleted: false })

    await conflict.resolve('disk')
    expect(h.authority.reconciles).toEqual([{ keep: 'disk', expected_revision: 1, resource_id: 'a.txt' }])
    await settle(h.authority, [{ session: h.registry.session(info.path)!, live: h.live.get('a.txt')! }])
    expect(h.registry.snapshot(info.id).text).toBe('disk text')
    expect(view.text).toBe('disk text')
    expect(useHostState.getState().conflicts[info.path]).toBeUndefined()
  })

  test('keeping the authority text leaves the editor alone and clears the conflict', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    const view = host()
    view.seed(info.text)
    h.registry.createSync(info, view)
    await h.registry.edit(info.id, 0, [{ from: 5, to: 5, insert: '!' }])
    h.authority.externalWrite('disk text')
    await useHostState.getState().conflicts[info.path]!.resolve('authority')
    expect(h.authority.reconciles).toEqual([{ keep: 'authority', expected_revision: 1, resource_id: 'a.txt' }])
    expect(h.authority.text).toBe('hello!')
    expect(h.authority.disk).toBe('hello!')
    expect(useHostState.getState().conflicts[info.path]).toBeUndefined()
  })

  test('another page choosing a side ends the conflict on this page too; an edit while it stands does not', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    const view = host()
    view.seed(info.text)
    h.registry.createSync(info, view)
    await h.registry.edit(info.id, 0, [{ from: 5, to: 5, insert: '!' }])
    h.authority.externalWrite('disk text')
    expect(useHostState.getState().conflicts[info.path]).toMatchObject({ revision: 1 })

    // Still unsaved after another edit: the bar stays.
    await h.registry.edit(info.id, 1, [{ from: 6, to: 6, insert: '?' }])
    const mine = { session: h.registry.session(info.path)!, live: h.live.get('a.txt')! }
    await settle(h.authority, [mine])
    expect(useHostState.getState().conflicts[info.path]).toMatchObject({ revision: 1 })

    // Another page keeps the shared text; this page hears only `document.saved`.
    const other = await h.authority.open()
    disposers.push(() => other.session.dispose())
    await other.session.resolveConflict('authority')
    await settle(h.authority, [mine, other])
    expect(h.authority.disk).toBe('hello!?')
    expect(useHostState.getState().conflicts[info.path]).toBeUndefined()
    expect(useHostState.getState().docs[info.path]).toMatchObject({ dirty: false })
  })

  test('a deleted checkout is reported as deleted', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    h.registry.createSync(info, host())
    h.authority.externalWrite('', true)
    expect(useHostState.getState().conflicts[info.path]).toMatchObject({ diskDeleted: true })
  })

  test('typing in the editor is pending in the host state until the authority accepts it, and blocks doc_edit', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    const view = host()
    view.seed(info.text)
    const sync = h.registry.createSync(info, view) as unknown as import('../src/host/session-sync').SessionDocSync
    const { ChangeSet } = await import('@codemirror/state')
    view.type(sync, ChangeSet.of([{ from: 5, to: 5, insert: '😀' }], 5))
    expect(useHostState.getState().docs[info.path]).toMatchObject({ pending: true, dirty: true })
    await expect(h.registry.edit(info.id, 0, [{ from: 0, to: 0, insert: 'x' }])).rejects.toMatchObject({ kind: 'outOfSync' })
    await sync.whenIdle()
    expect(h.authority.text).toBe('hello😀')
    expect(useHostState.getState().docs[info.path]).toMatchObject({ pending: false, revision: 1 })
  })

  test('a second editor sync replaces the first: remote changes reach only the newest', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    const older = host()
    older.seed(info.text)
    h.registry.createSync(info, older)
    const newer = host()
    newer.seed(info.text)
    h.registry.createSync(info, newer)
    const other = await h.authority.open()
    disposers.push(() => other.session.dispose())
    other.session.edit([{ start: 5, end: 5, insert: '!' }])
    await settle(h.authority, [{ session: h.registry.session(info.path)!, live: h.live.get('a.txt')! }])
    expect(newer.text).toBe('hello!')
    expect(older.shown).toEqual([])
  })

  test('history answers false before an editor exists, and undoes this client\'s edit once one does', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    const history = h.registry.history(info.id)!
    expect(history.undo()).toBe(false)
    const view = host()
    view.seed(info.text)
    const sync = h.registry.createSync(info, view) as unknown as import('../src/host/session-sync').SessionDocSync
    const { ChangeSet } = await import('@codemirror/state')
    view.type(sync, ChangeSet.of([{ from: 0, to: 0, insert: 'X' }], 5))
    await sync.whenIdle()
    expect(history.undo()).toBe(true)
    await sync.whenIdle()
    expect(h.authority.text).toBe('hello')
    expect(history.redo()).toBe(true)
    await sync.whenIdle()
    expect(h.authority.text).toBe('Xhello')
    expect(h.registry.history(9999)).toBeUndefined()
  })
})

describe('reconnect', () => {
  test('after a stream gap and a resync, the document shows the revisions it missed', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    const other = await h.authority.open()
    disposers.push(() => other.session.dispose())
    h.live.get('a.txt')!.hold()
    other.session.edit([{ start: 5, end: 5, insert: ' there' }])
    await other.session.flushed()
    expect(h.registry.snapshot(info.id)).toMatchObject({ text: 'hello', version: 0 })
    h.live.get('a.txt')!.release(true)
    await h.live.get('a.txt')!.resync()
    await settle(h.authority, [{ session: h.registry.session(info.path)!, live: h.live.get('a.txt')! }])
    expect(h.registry.snapshot(info.id)).toMatchObject({ text: 'hello there', version: 1 })
    expect(useHostState.getState().docs[info.path]).toMatchObject({ revision: 1 })
  })
})

describe('commands', () => {
  test('doc_edit takes its changes in the frontend\'s wrapper, and a missing argument is invalid input', async () => {
    const h = await harness()
    const table = documentCommands(h.registry)
    const info = (await table.doc_open!({ path: `${ROOT}/a.txt` })) as { id: number }
    expect(await table.doc_edit!({ doc: info.id, baseVersion: 0, changes: { changes: [{ from: 0, to: 0, insert: '#' }] } })).toBe(1)
    await expect(Promise.resolve().then(() => table.doc_snapshot!({}))).rejects.toMatchObject({ kind: 'invalidInput' })
    expect(await table.doc_save!({ doc: info.id })).toBeNull()
    expect(h.authority.saved).toBe(1)
    expect(thrown(() => table.doc_set_encoding!({}))).toMatchObject({ kind: 'unavailable' })
    expect(thrown(() => table.doc_set_line_ending!({}))).toMatchObject({ kind: 'unavailable' })
    expect(await table.doc_sync_from_disk!({})).toBeNull()
  })

  test('the editor backend is OpenIDEA\'s IPC backend with the session sync in place of its own', async () => {
    const h = await harness()
    const info = await h.registry.open(`${ROOT}/a.txt`)
    const backend = sessionBackend(h.registry)
    const sync = backend.createSync!(info, { applyRemote: () => {} })
    expect(sync.localText.toString()).toBe('hello')
    expect((sync as unknown as { serverVersion: number }).serverVersion).toBe(0)
    expect(Object.keys(backend).length).toBeGreaterThan(5)
    expect(thrown(() => backend.createSync!({ ...info, id: 9999 }, { applyRemote: () => {} }))).toMatchObject({ kind: 'notFound' })
  })
})
