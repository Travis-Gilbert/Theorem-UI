import { expect, test } from 'bun:test'
import { appDocumentFixture } from '../../../test/blocks/app-documents'
import { AppDocument } from './apps'
import { appContextReference, captureAppSelection } from './app-references'

test('a selected row keeps the revision actually selected instead of becoming current evidence', async () => {
  const store = await appDocumentFixture()
  const app = new AppDocument('app-document', store.api, store.change)
  const initial = await app.load()
  const selected = {
    source: initial.html,
    revision: initial.revision,
    selection: { text: 'Firefox', rowId: 'firefox', field: 'privacy' },
  }
  const newer = {
    ...initial,
    revision: { position: 2, contentDigest: 'new-state' },
  }
  expect(appContextReference(newer, selected).location.revision).toBe('1')
  expect(JSON.parse(appContextReference(newer, selected).excerpt!)).toEqual({
    selection: selected.selection,
  })
})
test('a selection from replaced App source is never attached to the new source', async () => {
  const store = await appDocumentFixture()
  const app = new AppDocument('app-document', store.api, store.change)
  const initial = await app.load()
  await store.remote('<p>Different App layout</p>')
  const current = await app.load()
  const ref = appContextReference(current, {
    source: initial.html,
    revision: initial.revision,
    selection: { text: 'old row' },
  })
  expect(ref.excerpt).toBeUndefined()
  expect(ref.location.revision).toBe('2')
})

test('pending App state cannot become a saved selection or whole-App reference', async () => {
  const store = await appDocumentFixture()
  const app = new AppDocument('app-document', store.api, store.change)
  const snapshot = { ...(await app.load()), pendingState: true }
  expect(
    captureAppSelection(snapshot.html, snapshot, { text: 'Unsaved' }),
  ).toBeUndefined()
  expect(() => appContextReference(snapshot)).toThrow(
    'Save the App changes before asking',
  )
})

test('selection capture requires the same saved source and retains its exact revision', async () => {
  const store = await appDocumentFixture()
  const app = new AppDocument('app-document', store.api, store.change)
  const snapshot = await app.load()
  const selection = { text: 'Saved' }
  expect(captureAppSelection(snapshot.html, null, selection)).toBeUndefined()
  expect(captureAppSelection('different', snapshot, selection)).toBeUndefined()
  expect(captureAppSelection(snapshot.html, snapshot, selection)).toEqual({
    source: snapshot.html,
    revision: snapshot.revision,
    selection,
  })
})
