// SOURCING: Theorem's saved Data Views (rustyred-thg-mcp graphql/data.rs `dataViews`, `upsertDataView`: a tenant-scoped DataView node whose `query` is any object) through lib/theorem/graphql and @tanstack/react-query; a Notes view is that node with the library's scope, filter, sort and layout in its query, so a view saved here is the same record an agent or the SDK can read
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mutate } from '@/lib/theorem/client'
import { graphql } from '@/lib/theorem/graphql'

/** What a Library pane shows and how; the same shape is a saved view's query. */
export type LibraryQuery = {
  /** `all`, `class:<id>` or `collection:<id>`. */
  scope: string
  /** Classes to keep, when narrowed; empty keeps all. */
  classes: string[]
  search: string
  sort: 'updated' | 'created' | 'title'
  /** `board` only where the class has one on (classes.ts boardField). */
  layout: 'gallery' | 'list' | 'board'
}

export const defaultLibraryQuery = (scope: string): LibraryQuery => ({
  scope,
  classes: [],
  search: '',
  sort: 'updated',
  layout: 'gallery',
})

/** Where this browser keeps how each scope was last laid out and sorted. */
const shapeKey = (scope: string) => `theorem.notes.shape.${scope}`
const LAYOUTS = new Set(['gallery', 'list', 'board'])
const SORTS = new Set(['updated', 'created', 'title'])

/**
 * A scope as this person last left it: its layout and sort come back after
 * a reload. Only a convenience for this browser; a saved view is the record.
 */
export function rememberedLibraryQuery(scope: string): LibraryQuery {
  const query = defaultLibraryQuery(scope)
  try {
    const kept = JSON.parse(localStorage.getItem(shapeKey(scope)) ?? '{}')
    if (LAYOUTS.has(kept?.layout)) query.layout = kept.layout
    if (SORTS.has(kept?.sort)) query.sort = kept.sort
  } catch {
    // Storage can be blocked or empty; the defaults stand.
  }
  return query
}

export function rememberLibraryShape(query: LibraryQuery) {
  try {
    localStorage.setItem(
      shapeKey(query.scope),
      JSON.stringify({ layout: query.layout, sort: query.sort }),
    )
  } catch {
    // Nothing to keep it in; the pane still works.
  }
}

/** The key a Notes view keeps its query under, beside anything else a view holds. */
const NOTES_QUERY = 'theorem.notes.library'

export type SavedView = {
  id: string
  title: string
  description?: string
  query: LibraryQuery
  updatedAt?: number
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function decodeView(raw: unknown): SavedView | undefined {
  if (!isObject(raw)) return undefined
  const values = isObject(raw.fields)
    ? raw.fields
    : isObject(raw.properties)
      ? raw.properties
      : {}
  const query = isObject(values.query) ? values.query[NOTES_QUERY] : undefined
  if (!isObject(query) || typeof query.scope !== 'string') return undefined
  const id =
    typeof values.view_id === 'string' ? values.view_id : String(raw.id)
  return {
    id,
    title: typeof values.title === 'string' ? values.title : id,
    description:
      typeof values.description === 'string' ? values.description : undefined,
    query: {
      ...defaultLibraryQuery(query.scope),
      ...(query as Partial<LibraryQuery>),
    },
    updatedAt:
      typeof values.updated_at_ms === 'number'
        ? values.updated_at_ms
        : undefined,
  }
}

const viewsKey = ['theorem', 'objects', 'views'] as const

/** The saved views Notes made; views other surfaces saved are left to them. */
export function useSavedViews() {
  return useQuery({
    queryKey: viewsKey,
    queryFn: async () => {
      const data = await graphql<{ dataViews: unknown }>(
        `
          query Views($limit: Int) {
            dataViews(limit: $limit)
          }
        `,
        { limit: 200 },
      )
      const records = isObject(data.dataViews) ? data.dataViews.records : []
      return (Array.isArray(records) ? records : [])
        .map(decodeView)
        .filter((view): view is SavedView => !!view)
    },
    staleTime: 30_000,
  })
}

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'view'

/** Save a view, or replace the one named by `id`. */
export function useSaveView() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      title,
      query,
    }: {
      id?: string
      title: string
      query: LibraryQuery
    }) =>
      mutate((headers) =>
        graphql(
          `
            mutation SaveView($id: String!, $query: JSON!, $title: String) {
              upsertDataView(id: $id, query: $query, title: $title)
            }
          `,
          {
            id: id ?? `notes-${slug(title)}-${Date.now().toString(36)}`,
            title,
            query: { [NOTES_QUERY]: query },
          },
          headers,
        ),
      ),
    onSettled: () => void client.invalidateQueries({ queryKey: viewsKey }),
  })
}
