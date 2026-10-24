// SOURCING: none — maps an OpenUI Query's runtime arguments onto a view's stored Binding (SPEC-INDEX-WORKSPACE-1.0 §3.3); OpenUI's toolProvider takes a plain function map, so the only code here is the merge
import type { AtlasOverlay, Binding, ItemQuery, QueryResult } from './contract'

const OVERLAYS: readonly AtlasOverlay[] = [
  'density',
  'boundary',
  'quantization_error',
  'activity',
]

/** An argument the program left empty keeps the stored binding's value. */
const given = (value: unknown) =>
  value !== undefined &&
  value !== null &&
  value !== '' &&
  !(Array.isArray(value) && value.length === 0)

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
const strings = (value: unknown) =>
  Array.isArray(value) && value.every((v) => typeof v === 'string')
    ? value
    : undefined

function pick<T>(stored: T, arg: unknown, read: (v: unknown) => T | undefined) {
  return given(arg) ? (read(arg) ?? stored) : stored
}

/**
 * The binding a Query runs: the view's stored binding with the program's
 * non-empty arguments laid over it. A search field bound to `$q` narrows an
 * items binding; it never changes the binding's kind.
 */
export function mergeBinding(
  binding: Binding,
  args: Record<string, unknown>,
): Binding {
  switch (binding.kind) {
    case 'items': {
      const query: ItemQuery = { ...binding.query }
      query.q = pick(query.q, args.q, text)
      query.collectionId = pick(query.collectionId, args.collectionId, text)
      query.kind = pick(query.kind, args.kind, text)
      query.ids = pick(query.ids, args.ids, strings)
      query.limit = pick(query.limit, args.limit, count)
      query.sort = pick(query.sort, args.sort, (v) =>
        v === 'updated' || v === 'title' ? v : undefined,
      )
      for (const key of Object.keys(query) as (keyof ItemQuery)[])
        if (query[key] === undefined || query[key] === '') delete query[key]
      return { kind: 'items', query }
    }
    case 'used_together':
      return {
        kind: 'used_together',
        anchorIds: pick(binding.anchorIds, args.anchorIds, strings),
        ...(given(args.limit) || binding.limit !== undefined
          ? { limit: pick(binding.limit, args.limit, count) }
          : {}),
      }
    case 'filing_history':
      return {
        kind: 'filing_history',
        documentId: pick(binding.documentId, args.documentId, text),
      }
    case 'map': {
      const overlay = pick(binding.overlay, args.overlay, (v) =>
        OVERLAYS.find((o) => o === v),
      )
      const cell = pick(binding.cell, args.cell, count)
      return {
        kind: 'map',
        ...(overlay ? { overlay } : {}),
        ...(cell !== undefined ? { cell } : {}),
      }
    }
    case 'collections':
      return binding
  }
}

/** OpenUI's function-map tool provider: one tool per binding name. */
export function bindingTools(
  bindings: Record<string, Binding>,
  run: (binding: Binding) => Promise<QueryResult>,
) {
  return Object.fromEntries(
    Object.entries(bindings).map(([name, binding]) => [
      name,
      (args: Record<string, unknown>) => run(mergeBinding(binding, args)),
    ]),
  )
}
