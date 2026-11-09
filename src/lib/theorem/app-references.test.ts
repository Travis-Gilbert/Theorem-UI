import { expect, test } from 'bun:test'
import { appDocumentFixture } from '../../../test/blocks/app-documents'
import { AppDocument } from './apps'
import {
  appContextReference,
  captureAppSelection,
  notebookReference,
  pinnedAppReference,
} from './app-references'

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

test('a selected entity is context on its own, and names the reference', async () => {
  const store = await appDocumentFixture()
  const app = new AppDocument('app-document', store.api, store.change)
  const snapshot = await app.load()
  const selection = {
    text: '',
    entityId: 'gpu-lane-7',
    entityLabel: 'GPU lane 7',
  }
  const ref = appContextReference(snapshot, {
    source: snapshot.html,
    revision: snapshot.revision,
    selection,
  })
  expect(ref.label).toBe(`${snapshot.title}: GPU lane 7`)
  expect(JSON.parse(ref.excerpt!)).toEqual({ selection })
})

test('a pinned revision is referenced at that revision, never the current one', () => {
  const ref = pinnedAppReference(
    { documentId: 'app-document', title: 'CPU vs GPU', position: 1 },
    { text: '', entityId: 'warp-2', entityLabel: 'Warp 2' },
  )
  expect(ref.location).toEqual({
    resource: {
      kind: 'graph-object',
      objectId: 'app-document',
      objectType: 'theorem.app',
    },
    revision: '1',
  })
  expect(ref.label).toBe('CPU vs GPU (revision 1): Warp 2')
  expect(JSON.parse(ref.excerpt!).selection.entityId).toBe('warp-2')
  expect(
    pinnedAppReference({ documentId: 'd', title: 'T', position: 3 }).excerpt,
  ).toBeUndefined()
})

test('a notebook selection names the App revision and the cell, point or entity selected', () => {
  const notebook = {
    documentId: 'doc-crossover',
    position: 3,
    title: 'GPU crossover',
    cellIds: ['chart', 'timings'],
  }
  const point = notebookReference(notebook, {
    text: '',
    cellId: 'chart',
    entityId: 'gpu-total-1e6',
    entityLabel: 'GPU at 1,000,000 items',
  })
  // The backend refuses `kind: 'artifact'`; a notebook is an App document.
  expect(point.location).toEqual({
    resource: { kind: 'graph-object', objectId: 'doc-crossover', objectType: 'theorem.app' },
    revision: '3',
  })
  expect(point.label).toBe('GPU crossover: GPU at 1,000,000 items')
  // The backend derives the entity locator; an explicit one would replace it.
  const pointed = JSON.parse(point.excerpt!).selection
  expect(pointed.entityId).toBe('gpu-total-1e6')
  expect(pointed.locator).toBeUndefined()

  const cell = notebookReference(notebook, { text: '', cellId: 'timings' })
  expect(cell.label).toBe('GPU crossover: cell timings')
  expect(JSON.parse(cell.excerpt!).selection.locator).toEqual({
    kind: 'notebook_cell',
    cellId: 'timings',
  })
  // A cell the revision is not known to have would refuse the turn, so it gets no locator.
  const unknown = notebookReference(notebook, { text: '', cellId: 'cell-4' })
  expect(JSON.parse(unknown.excerpt!).selection).toEqual({ text: '', cellId: 'cell-4' })

  const whole = notebookReference(notebook, { text: '' })
  expect(whole.label).toBe('GPU crossover')
  expect(whole.excerpt).toBeUndefined()
})
