// SOURCING: none — pure logic over the work contract: the narrowing a place applies to a view (GitHub only, local only) without making it part of the saved view
import type { WorkFilter } from './contract'

export const SOURCE_CHOICES = ['all', 'github', 'local'] as const
export type SourceChoice = (typeof SOURCE_CHOICES)[number]

const only = (provider: 'github' | 'local'): WorkFilter => ({
  op: 'and',
  conditions: [{ field: 'provider', operator: 'is', value: provider }],
})

// One object each, so a view state built from them keeps its query between renders.
const GITHUB_ONLY = only('github')
const LOCAL_ONLY = only('local')

/** The filter a place adds to a view for the source it shows; nothing for "all". */
export function sourceFilter(source: string | undefined): WorkFilter | undefined {
  if (source === 'github') return GITHUB_ONLY
  if (source === 'local') return LOCAL_ONLY
  return undefined
}

export const SOURCE_LABEL: Record<SourceChoice, string> = {
  all: 'All sources',
  github: 'GitHub only',
  local: 'Local only',
}
