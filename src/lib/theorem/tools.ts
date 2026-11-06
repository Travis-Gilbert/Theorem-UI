// SOURCING: @theoremharness/sdk tools client (GET /api/environment/v1/tools, the native tool catalog), @tanstack/react-query (server state), fuzzysort (name matching, as the quick switcher uses it)
import { queryOptions, useQuery } from '@tanstack/react-query'
import fuzzysort from 'fuzzysort'
import { theorem } from './client'
import { isNotServed } from './passthrough'

/** What a tool changes, from the MCP annotations its descriptor carries. */
export type ToolEffect = 'read' | 'write' | 'destructive'

export type NativeTool = {
  name: string
  description?: string
  effect: ToolEffect
}

type Annotations = { readOnlyHint?: boolean; destructiveHint?: boolean }

const effectOf = (annotations: Annotations | undefined): ToolEffect =>
  annotations?.destructiveHint
    ? 'destructive'
    : annotations?.readOnlyHint === false
      ? 'write'
      : 'read'

/** The first sentence: the list shows two lines at most, and descriptions run long. */
const summary = (description: string | undefined) =>
  description?.trim().split(/(?<=[.!?])\s/u)[0] || undefined

export const toolCatalogQuery = queryOptions({
  queryKey: ['theorem', 'tools'],
  queryFn: async () => {
    const { tools } = await theorem().tools.list()
    return tools
      .map((tool): NativeTool => ({
        name: tool.name,
        ...(summary(tool.description)
          ? { description: summary(tool.description) }
          : {}),
        effect: effectOf(tool.annotations as Annotations | undefined),
      }))
      .toSorted((a, b) => a.name.localeCompare(b.name))
  },
  staleTime: 5 * 60_000,
  retry: (count, error) => !isNotServed(error) && count < 2,
})

export type ToolCatalogState =
  | { status: 'loading'; tools: readonly NativeTool[] }
  | { status: 'ready'; tools: readonly NativeTool[] }
  | { status: 'not-served'; tools: readonly NativeTool[] }
  | { status: 'failed'; tools: readonly NativeTool[] }

const NONE: readonly NativeTool[] = []

/** The native tools this person's turns can call. */
export function useToolCatalog(): ToolCatalogState {
  const { data, error } = useQuery(toolCatalogQuery)
  if (data) return { status: 'ready', tools: data }
  if (error)
    return { status: isNotServed(error) ? 'not-served' : 'failed', tools: NONE }
  return { status: 'loading', tools: NONE }
}

/**
 * Tools for a typed query: fuzzy matches on the name first, best first, then
 * tools whose description contains the query. An empty query lists them all.
 */
export function searchTools(
  tools: readonly NativeTool[],
  query: string,
): readonly NativeTool[] {
  const want = query.trim().toLowerCase()
  if (!want) return tools
  const byName = fuzzysort
    .go(want, tools, { key: 'name', threshold: 0.2 })
    .map((result) => result.obj)
  if (want.length < 3) return byName
  const named = new Set(byName)
  return [
    ...byName,
    ...tools.filter(
      (tool) =>
        !named.has(tool) && tool.description?.toLowerCase().includes(want),
    ),
  ]
}
