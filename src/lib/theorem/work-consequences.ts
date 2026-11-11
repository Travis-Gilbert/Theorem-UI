// SOURCING: @tanstack/react-query over lib/theorem/passthrough and client.mutate; the wire types are the work tracker's (components/work/contract). The tracker's other settings belong to the work tracker, so this module reads the whole document and writes it back with only `consequences` changed.
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SETTINGS_KEY } from '@/components/work/cache'
import type { WorkConsequence, WorkSettings } from '@/components/work/contract'
import { hasStatus, mutate } from './client'
import { theoremJson } from './passthrough'

export type { WorkSettings }
export type ConsequenceId = WorkConsequence['id']

/** What each GitHub event does, in the order the settings page lists them. */
export const CONSEQUENCES: readonly {
  id: ConsequenceId
  title: string
  description: string
}[] = [
  {
    id: 'push_refreshes_context',
    title: 'A push refreshes what Theorem knows',
    description:
      'When someone pushes to a tracked repository, Theorem reads the repository again.',
  },
  {
    id: 'review_request_creates_inbox_entry',
    title: 'A review request lands in your work inbox',
    description: 'When you are asked to review a pull request, it appears in the inbox.',
  },
  {
    id: 'failed_workflow_starts_investigation',
    title: 'A failed workflow starts an investigation',
    description: 'When a workflow run fails, the agent looks into why and reports in the inbox.',
  },
  {
    id: 'issue_comment_joins_task',
    title: 'A comment on an issue joins its task',
    description: 'New comments on a tracked issue are added to the task they belong to.',
  },
]

const path = '/api/work/v1/settings'

/** The tracker's own cache entry, so a switch flipped on either settings page shows on both. */
export const workSettingsKey = SETTINGS_KEY

export const workSettingsQuery = queryOptions({
  queryKey: workSettingsKey,
  queryFn: () => theoremJson<WorkSettings>(path),
})

export const useWorkSettings = () => useQuery(workSettingsQuery)

/** The document with one consequence set; a consequence the server did not list is added. */
export function withConsequence(
  settings: WorkSettings,
  id: ConsequenceId,
  enabled: boolean,
): WorkSettings {
  const listed = settings.consequences.some((entry) => entry.id === id)
  return {
    ...settings,
    consequences: listed
      ? settings.consequences.map((entry) =>
          entry.id === id ? { ...entry, enabled } : entry,
        )
      : [...settings.consequences, { id, enabled }],
  }
}

/**
 * Sets one consequence. The document is read again just before the write so
 * nothing else in it is overwritten by a stale copy, and written with the
 * revision it was read at; a revision that moved in between is read again once.
 */
export async function writeConsequence(
  id: ConsequenceId,
  enabled: boolean,
): Promise<WorkSettings> {
  const attempt = async () => {
    const current = await theoremJson<WorkSettings>(path)
    return mutate((headers) =>
      theoremJson<WorkSettings>(path, {
        method: 'PUT',
        headers: { ...headers, 'If-Match': current.revision },
        body: withConsequence(current, id, enabled),
      }),
    )
  }
  try {
    return await attempt()
  } catch (error) {
    if (!hasStatus(error, 409, 412)) throw error
    return attempt()
  }
}

/** Flips one consequence on the page at once and puts it back if the server refuses. */
export function useConsequenceMutation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: ConsequenceId; enabled: boolean }) =>
      writeConsequence(id, enabled),
    onMutate: async ({ id, enabled }) => {
      await client.cancelQueries({ queryKey: workSettingsKey })
      const previous = client.getQueryData<WorkSettings>(workSettingsKey)
      if (previous)
        client.setQueryData(workSettingsKey, withConsequence(previous, id, enabled))
      return { previous }
    },
    onSuccess: (settings) => client.setQueryData(workSettingsKey, settings),
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(workSettingsKey, context.previous)
    },
    onSettled: () => client.invalidateQueries({ queryKey: workSettingsKey }),
  })
}
