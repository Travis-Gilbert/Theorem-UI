// SOURCING: none — the Index's built-in view definitions as OpenUI Lang programs over the library in ./library; they are data, written in the language the library renders
import type { IndexView, Operation, Scope, ViewRevision } from './contract'

const OPERATIONS: Operation[] = [
  'open_item',
  'file_item',
  'correct_filing',
  'undo_correction',
  'ask_theorem',
  'pin_view',
  'set_preference',
]

const HOME = `$q = ""
root = Stack([search, results, shelves])
search = SearchField("Search the Index", $q)
found = Query("items", {q: $q}, {items: [], total: 0})
results = Section("Recent", [list])
list = ItemList(found.items, "list", "none", "Nothing matches yet.")
cols = Query("collections", {}, {collections: []})
shelves = Section("Collections", [grid])
grid = CollectionGrid(cols.collections)`

const COLLECTION = `$q = ""
root = Stack([search, results])
search = SearchField("Search this collection", $q)
found = Query("items", {q: $q}, {items: [], total: 0})
results = ItemList(found.items, "list", "kind", "This collection is empty.")`

const ATLAS = `$overlay = "density"
root = Stack([overlay, map])
overlay = Choice("Shade by", ["density", "boundary", "quantization_error", "activity"], $overlay)
m = Query("map", {overlay: $overlay}, {snapshot: null})
map = Atlas(m.snapshot, $overlay)`

export const DEFAULT_PREFIX = 'default:'
export const ATLAS_VIEW_ID = 'default:atlas'
export const isDefaultView = (viewId: string) =>
  viewId.startsWith(DEFAULT_PREFIX)

function revision(
  fields: Pick<ViewRevision, 'title' | 'purpose' | 'program' | 'bindings'>,
): ViewRevision {
  return {
    revision: 0,
    createdAtMs: 0,
    author: { kind: 'engine' },
    operations: OPERATIONS,
    note: 'Built into Theorem UI.',
    ...fields,
  }
}

function defaultView(
  viewId: string,
  scope: Scope,
  current: ViewRevision,
): IndexView {
  return {
    viewId,
    scope,
    origin: 'default',
    pinned: false,
    archived: false,
    createdAtMs: 0,
    updatedAtMs: 0,
    current,
  }
}

/** The view a scope opens with before anything is saved or learned. */
export function defaultViewFor(
  scope: Scope,
  collectionName?: string,
): IndexView {
  if (scope.kind === 'home')
    return defaultView(
      'default:home',
      scope,
      revision({
        title: 'Everything',
        purpose:
          'Search everything filed, newest first, and the collections it is in.',
        program: HOME,
        bindings: {
          items: { kind: 'items', query: { sort: 'updated' } },
          collections: { kind: 'collections' },
        },
      }),
    )
  return defaultView(
    `default:collection:${scope.collectionId}`,
    scope,
    revision({
      title: collectionName ?? 'Collection',
      purpose: 'Everything filed in this collection, grouped by kind.',
      program: COLLECTION,
      bindings: {
        items: {
          kind: 'items',
          query: { collectionId: scope.collectionId, sort: 'updated' },
        },
      },
    }),
  )
}

export const atlasView = (): IndexView =>
  defaultView(
    ATLAS_VIEW_ID,
    { kind: 'home' },
    revision({
      title: 'Atlas',
      purpose:
        'Where the material sits by meaning. A way to look, never a way to file.',
      program: ATLAS,
      bindings: { map: { kind: 'map', overlay: 'density' } },
    }),
  )

/** Every built-in view, for tests and for resolving a default id from the URL. */
export function resolveDefaultView(
  viewId: string,
  collectionName?: (collectionId: string) => string | undefined,
): IndexView | undefined {
  if (viewId === ATLAS_VIEW_ID) return atlasView()
  if (viewId === 'default:home') return defaultViewFor({ kind: 'home' })
  const prefix = 'default:collection:'
  if (viewId.startsWith(prefix)) {
    const collectionId = viewId.slice(prefix.length)
    return defaultViewFor(
      { kind: 'collection', collectionId },
      collectionName?.(collectionId),
    )
  }
  return undefined
}
