// Evidence grade: fixture. Real CodeMirror state and view (happy-dom) and the real SDK
// DocumentSession, against the in-process authority in ./fixtures/authority.ts.
import { afterEach, describe, expect, test } from 'bun:test'
import { Annotation, Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { undo, redo } from '../src/host/cm-commands'
import { Authority, settle } from './fixtures/authority'
import { mount, spliceScalars, type Mounted } from './support/editor'

const open: Mounted[] = []
afterEach(() => {
  for (const m of open.splice(0)) m.destroy()
})

async function editor(authority: Authority, options?: Parameters<typeof mount>[1]) {
  const { session, live } = await authority.open()
  const m = mount(session, options)
  open.push(m)
  return { ...m, m, session, live }
}

describe('UTF-16 editor offsets against scalar host offsets', () => {
  test('typing an emoji and text after it lands at the scalar offset', async () => {
    const authority = new Authority('ab')
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: 1, insert: '😀' }, userEvent: 'input.type' })
    e.view.dispatch({ changes: { from: 3, insert: 'x' }, userEvent: 'input.type' })
    await settle(authority, [e])
    expect(authority.text).toBe('a😀xb')
    e.assertInStep()
    // The host saw scalar offsets, not UTF-16: the second edit starts at scalar 2, not 3.
    expect(authority.records.map((r) => r.edits.map((x) => x.start))).toEqual([[1], [2]])
  })

  test('an edit after an astral character in the existing text', async () => {
    const authority = new Authority('😀 tail')
    const e = await editor(authority)
    // UTF-16 offset 3 is after the emoji (2 units) and the space; scalar offset is 2.
    e.view.dispatch({ changes: { from: 3, to: 7, insert: 'head' } })
    await settle(authority, [e])
    expect(authority.text).toBe('😀 head')
    expect(authority.records[0]!.edits[0]).toMatchObject({ start: 2, end: 6, removed: 'tail' })
  })

  test('deleting a whole emoji', async () => {
    const authority = new Authority('a😀b')
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: 1, to: 3 } })
    await settle(authority, [e])
    expect(authority.text).toBe('ab')
    expect(authority.records[0]!.edits[0]).toMatchObject({ start: 1, end: 2, removed: '😀' })
  })

  test('combining characters are separate scalars', async () => {
    const text = 'éx' // e, COMBINING ACUTE, x: 3 UTF-16 units, 3 scalars
    const authority = new Authority(text)
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: 1, to: 2 } }) // delete the accent only
    await settle(authority, [e])
    expect(authority.text).toBe('ex')
    e.view.dispatch({ changes: { from: 1, insert: '̀' } }) // add a grave
    await settle(authority, [e])
    expect(authority.text).toBe('èx')
    e.assertInStep()
  })

  test('a ZWJ sequence: editing between its scalars', async () => {
    const family = '👨‍👩‍👧' // 8 UTF-16 units, 5 scalars
    const authority = new Authority(`x${family}y`)
    const e = await editor(authority)
    // Remove the woman (UTF-16 4..6 after the leading x) and keep the joiners.
    e.view.dispatch({ changes: { from: 4, to: 6 } })
    await settle(authority, [e])
    expect(authority.text).toBe(spliceScalars(`x${family}y`, 3, 4, ''))
    expect(authority.records[0]!.edits[0]).toMatchObject({ start: 3, end: 4, removed: '👩' })
    e.assertInStep()
  })

  test('a flag (two regional indicators) and a skin-tone modifier survive an edit beside them', async () => {
    const text = '🇯🇵 👍🏽!'
    const authority = new Authority(text)
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: text.length, insert: '?' } })
    await settle(authority, [e])
    expect(authority.text).toBe('🇯🇵 👍🏽!?')
    e.assertInStep()
  })

  test('a multi-change set (replace all) converts every offset against the pre-change text', async () => {
    const authority = new Authority('😀a😀b😀')
    const e = await editor(authority)
    e.view.dispatch({
      changes: [
        { from: 2, to: 3, insert: 'AA' },
        { from: 5, to: 6, insert: 'BB' },
      ],
    })
    await settle(authority, [e])
    expect(authority.text).toBe('😀AA😀BB😀')
    e.assertInStep()
  })
})

describe('edits at surrogate boundaries', () => {
  test('deleting only the low half of a pair removes the whole pair', async () => {
    const authority = new Authority('a😀b')
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: 2, to: 3 } })
    await settle(authority, [e])
    expect(authority.text).toBe('ab')
    e.assertInStep()
  })

  test('a transaction the filter rewrites keeps its annotations', async () => {
    const mine = Annotation.define<string>()
    const seen: { event: string | undefined; mine: string | undefined }[] = []
    const authority = new Authority('a😀b')
    const watch = EditorView.updateListener.of((update) => {
      for (const tr of update.transactions) {
        if (tr.docChanged) seen.push({ event: tr.annotation(Transaction.userEvent), mine: tr.annotation(mine) })
      }
    })
    const e = await editor(authority, { extensions: [watch] })
    e.view.dispatch({ changes: { from: 2, to: 3 }, userEvent: 'delete.backward', annotations: mine.of('kept') })
    await settle(authority, [e])
    expect(authority.text).toBe('ab')
    expect(seen).toEqual([{ event: 'delete.backward', mine: 'kept' }])
  })

  test('deleting only the high half of a pair removes the whole pair', async () => {
    const authority = new Authority('a😀b')
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: 1, to: 2 } })
    await settle(authority, [e])
    expect(authority.text).toBe('ab')
    e.assertInStep()
  })

  test('an insertion inside a pair moves to after it', async () => {
    const authority = new Authority('a😀b')
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: 2, insert: 'X' } })
    await settle(authority, [e])
    expect(authority.text).toBe('a😀Xb')
    e.assertInStep()
  })

  test('a replacement that starts inside a pair takes the pair with it', async () => {
    const authority = new Authority('a😀bc')
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: 2, to: 4, insert: 'Z' } })
    await settle(authority, [e])
    expect(authority.text).toBe('aZc')
    e.assertInStep()
  })

  test('a lone surrogate in inserted text becomes U+FFFD', async () => {
    const authority = new Authority('ab')
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: 1, insert: '\ud83d' } })
    await settle(authority, [e])
    expect(authority.text).toBe('a�b')
    e.assertInStep()
  })

  test('an explicit selection survives a widened edit', async () => {
    const authority = new Authority('a😀')
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: 2, to: 3 }, selection: { anchor: 2 } })
    await settle(authority, [e])
    expect(authority.text).toBe('a')
    expect(e.view.state.selection.main.head).toBeLessThanOrEqual(e.view.state.doc.length)
    e.assertInStep()
  })

  test('without the filter, a pair-splitting edit is refused by the session and the editor is restored', async () => {
    const authority = new Authority('a😀b')
    const e = await editor(authority, { filter: false })
    e.view.dispatch({ changes: { from: 2, to: 3 } })
    await Promise.resolve()
    await Promise.resolve()
    expect(e.discarded.length).toBe(1)
    expect(e.discarded[0]).toBeInstanceOf(RangeError)
    expect(e.text()).toBe('a😀b')
    expect(e.session.pending).toBe(false)
    expect(authority.records.length).toBe(0)
    e.assertInStep()
  })
})

describe('line endings', () => {
  test('a CRLF document keeps its carriage returns in the offsets', async () => {
    const authority = new Authority('a\r\nb😀\r\nc')
    const e = await editor(authority)
    // Doc lines: "a\r" | "b😀\r" | "c". After the emoji: 2 + 1 + 2 = 5 +... compute from the doc.
    const at = e.view.state.doc.toString().indexOf('😀') + 2
    e.view.dispatch({ changes: { from: at, insert: '!' } })
    await settle(authority, [e])
    expect(authority.text).toBe('a\r\nb😀!\r\nc')
    e.assertInStep()
  })

  test('a typed line break in a CRLF document is CRLF', async () => {
    const authority = new Authority('a\r\nb')
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: e.view.state.doc.length, insert: '\n' }, userEvent: 'input' })
    await settle(authority, [e])
    expect(authority.text).toBe('a\r\nb\r\n')
    e.assertInStep()
  })

  test('a typed line break in an LF document stays LF', async () => {
    const authority = new Authority('a\nb')
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: 3, insert: '\n' } })
    await settle(authority, [e])
    expect(authority.text).toBe('a\nb\n')
  })
})

describe('revisions, stale bases and reconnect', () => {
  test('the editor shows its own edit at once; the revision only moves when the host accepts it', async () => {
    const authority = new Authority('one')
    const e = await editor(authority)
    expect(e.sync.serverVersion).toBe(0)
    e.view.dispatch({ changes: { from: 3, insert: ' two' } })
    expect(e.text()).toBe('one two')
    expect(e.sync.serverVersion).toBe(0)
    expect(e.sync.idle).toBe(false)
    expect(e.sync.state()).toMatchObject({ pending: true, dirty: true, revision: 0 })
    await e.sync.whenIdle()
    expect(e.sync.serverVersion).toBe(1)
    expect(e.sync.idle).toBe(true)
  })

  test('two editors typing at once converge on the host text', async () => {
    const authority = new Authority('😀 base')
    const a = await editor(authority)
    const b = await editor(authority)
    a.view.dispatch({ changes: { from: a.view.state.doc.length, insert: ' a' } })
    b.view.dispatch({ changes: { from: 0, insert: 'b ' } })
    a.view.dispatch({ changes: { from: 0, insert: '>' } })
    await settle(authority, [a, b])
    expect(a.text()).toBe(authority.text)
    expect(b.text()).toBe(authority.text)
    a.assertInStep()
    b.assertInStep()
  })

  test('a stale base is refused, caught up from history and resent', async () => {
    const authority = new Authority('one')
    const a = await editor(authority)
    const b = await editor(authority)
    b.live.hold() // b will not hear about a's edit
    a.view.dispatch({ changes: { from: 3, insert: ' two' } })
    await settle(authority, [a])
    // b still believes revision 0; its edit is based on a stale revision.
    b.view.dispatch({ changes: { from: 0, insert: '> ' } })
    await b.sync.whenIdle()
    b.live.release(true)
    await settle(authority, [a, b])
    expect(authority.text).toBe('> one two')
    // The host refused one edit (stale), then accepted it re-based: exactly two revisions.
    expect(authority.records.length).toBe(2)
    expect(b.text()).toBe('> one two')
    expect(a.text()).toBe('> one two')
    b.assertInStep()
  })

  test('a reply lost after the host committed is not applied twice', async () => {
    const authority = new Authority('abc')
    const e = await editor(authority)
    authority.dropNextReply = true
    e.view.dispatch({ changes: { from: 3, insert: 'd' } })
    await settle(authority, [e])
    expect(authority.text).toBe('abcd')
    expect(authority.records.length).toBe(1)
    expect(e.text()).toBe('abcd')
    e.assertInStep()
  })

  test('after a stream gap the resync reads the missed revisions into the editor', async () => {
    const authority = new Authority('start')
    const a = await editor(authority)
    const b = await editor(authority)
    b.live.hold()
    a.view.dispatch({ changes: { from: 5, insert: ' 😀' } })
    await settle(authority, [a])
    a.view.dispatch({ changes: { from: 0, insert: '> ' } })
    await settle(authority, [a])
    expect(b.text()).toBe('start') // b is offline
    b.live.release(true) // the events are lost
    await b.live.resync()
    await settle(authority, [a, b])
    expect(b.text()).toBe('> start 😀')
    b.assertInStep()
  })

  test('typing while offline survives the reconnect', async () => {
    const authority = new Authority('x')
    const a = await editor(authority)
    const b = await editor(authority)
    b.live.hold()
    a.view.dispatch({ changes: { from: 1, insert: 'a' } })
    await settle(authority, [a])
    b.view.dispatch({ changes: { from: 0, insert: 'b' } })
    b.live.release(true)
    await b.live.resync()
    await settle(authority, [a, b])
    expect(authority.text).toBe('bxa')
    expect(a.text()).toBe('bxa')
    expect(b.text()).toBe('bxa')
  })

  test('an edit the host will never accept is dropped and the host text is shown', async () => {
    const authority = new Authority('keep')
    const e = await editor(authority)
    const refuse = Object.assign(new Error('forbidden'), { statusCode: 403, body: { code: 'read_only' } })
    const client = (e.session as unknown as { options: { client: any } }).options.client
    client.documentSessions.edit = async () => {
      throw refuse
    }
    e.view.dispatch({ changes: { from: 4, insert: ' me' } })
    await e.sync.whenIdle()
    expect(e.discarded).toContain(refuse)
    expect(e.text()).toBe('keep')
    e.assertInStep()
  })
})

describe('external modification', () => {
  test('a checkout change under unsaved edits is reported and resolved with the host text', async () => {
    const authority = new Authority('one')
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: 3, insert: ' two' } })
    await settle(authority, [e])
    authority.externalWrite('from disk')
    expect(e.conflicts).toMatchObject([{ document_id: 'doc', resource_id: 'a.txt', disk_deleted: false, revision: 1 }])
    await e.session.resolveConflict('authority')
    expect(authority.reconciles.at(-1)).toMatchObject({ keep: 'authority', expected_revision: 1 })
    expect(authority.disk).toBe('one two')
    expect(e.text()).toBe('one two')
  })

  test('resolving with the checkout text puts it into the editor', async () => {
    const authority = new Authority('one 😀')
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: 0, insert: '> ' } })
    await settle(authority, [e])
    authority.externalWrite('disk 😀 text')
    await e.session.resolveConflict('disk')
    await settle(authority, [e])
    expect(authority.reconciles.at(-1)).toMatchObject({ keep: 'disk' })
    expect(authority.text).toBe('disk 😀 text')
    expect(e.text()).toBe('disk 😀 text')
    e.assertInStep()
  })

  test('a deleted checkout is reported as such', async () => {
    const authority = new Authority('one')
    const e = await editor(authority)
    authority.externalWrite('', true)
    expect(e.conflicts[0]?.disk_deleted).toBe(true)
  })
})

describe('undo, redo, dirty and save', () => {
  test('undo reverts only this editor\'s edit, past another writer\'s change', async () => {
    const authority = new Authority('😀 base')
    const a = await editor(authority)
    const b = await editor(authority)
    a.view.dispatch({ changes: { from: a.view.state.doc.length, insert: ' mine' } })
    await settle(authority, [a, b])
    b.view.dispatch({ changes: { from: 0, insert: 'theirs ' } })
    await settle(authority, [a, b])
    expect(a.text()).toBe('theirs 😀 base mine')
    expect(undo(a.view)).toBe(true)
    await settle(authority, [a, b])
    expect(authority.text).toBe('theirs 😀 base')
    expect(a.text()).toBe('theirs 😀 base')
    expect(b.text()).toBe('theirs 😀 base')
    expect(redo(a.view)).toBe(true)
    await settle(authority, [a, b])
    expect(b.text()).toBe('theirs 😀 base mine')
    a.assertInStep()
  })

  test('undo has nothing to undo before an edit, and says so', async () => {
    const authority = new Authority('x')
    const e = await editor(authority)
    expect(undo(e.view)).toBe(false)
    expect(redo(e.view)).toBe(false)
  })

  test('typing in quick succession is one undo step; a pause starts another', async () => {
    let now = 1000
    const authority = new Authority('')
    const e = await editor(authority, { now: () => now })
    for (const ch of 'abc') {
      e.view.dispatch({ changes: { from: e.view.state.doc.length, insert: ch }, userEvent: 'input.type' })
      now += 50
    }
    now += 2000
    e.view.dispatch({ changes: { from: e.view.state.doc.length, insert: 'd' }, userEvent: 'input.type' })
    undo(e.view)
    expect(e.text()).toBe('abc')
    undo(e.view)
    expect(e.text()).toBe('')
    await settle(authority, [e])
    expect(authority.text).toBe('')
  })

  test('the browser\'s own undo event goes to the session', async () => {
    const authority = new Authority('x')
    const e = await editor(authority)
    e.view.dispatch({ changes: { from: 1, insert: 'y' } })
    const event = new InputEvent('beforeinput', { inputType: 'historyUndo', cancelable: true, bubbles: true })
    e.view.contentDOM.dispatchEvent(event)
    expect(e.text()).toBe('x')
    expect(event.defaultPrevented).toBe(true)
  })

  test('dirty and pending follow edits and saves', async () => {
    const authority = new Authority('text')
    const e = await editor(authority)
    expect(e.sync.state().dirty).toBe(false)
    const before = e.m.states
    e.view.dispatch({ changes: { from: 4, insert: '!' } })
    expect(e.sync.state()).toMatchObject({ pending: true, dirty: true })
    await settle(authority, [e])
    expect(e.sync.state()).toMatchObject({ pending: false, dirty: true })
    await e.session.save()
    expect(e.sync.state()).toMatchObject({ pending: false, dirty: false })
    expect(authority.saved).toBe(1)
    expect(authority.disk).toBe('text!')
    expect(e.m.states).toBeGreaterThan(before)
  })
})
