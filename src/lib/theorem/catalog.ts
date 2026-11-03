// SOURCING: @tanstack/react-query (the plugins and skills Theorem serves at /api/chat/v1/skills, through lib/theorem/passthrough)
import { queryOptions, useQuery } from '@tanstack/react-query'
import { isNotServed, theoremJson } from './passthrough'

export type PluginEntry = {
  id: string
  name: string
  description?: string
  skillCount?: number
}

export type SkillEntry = {
  id: string
  name: string
  description?: string
  /** The owning plugin's name, absent for a standalone skill. */
  plugin?: string
}

type SkillsBody = {
  plugins?: (PluginEntry & { description?: string | null })[]
  skills?: (Omit<SkillEntry, 'plugin'> & { plugin?: string | null })[]
}

export const catalogQuery = queryOptions({
  queryKey: ['theorem', 'skills'],
  queryFn: async () => {
    const body = await theoremJson<SkillsBody>('/api/chat/v1/skills')
    return {
      plugins: (body.plugins ?? []).map(({ description, ...plugin }) => ({
        ...plugin,
        ...(description ? { description } : {}),
      })),
      skills: (body.skills ?? []).map(({ plugin, ...skill }) => ({
        ...skill,
        ...(plugin ? { plugin } : {}),
      })),
    }
  },
  staleTime: 5 * 60_000,
  retry: (count, error) => !isNotServed(error) && count < 2,
})

const NONE = { plugins: [] as PluginEntry[], skills: [] as SkillEntry[] }

/** Plugins and skills this person's turns can load; empty until Theorem answers. */
export function useCatalogEntries() {
  const { data = NONE, error } = useQuery(catalogQuery)
  return { ...data, error }
}
