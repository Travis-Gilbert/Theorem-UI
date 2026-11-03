// SOURCING: @tanstack/react-query (the person's provider keys at /api/chat/v1/credentials, through lib/theorem/passthrough; Theorem stores and verifies them, the UI never sees one back)
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mutate } from './client'
import { isNotServed, theoremJson } from './passthrough'

export type Credential = {
  provider: string
  configured: boolean
  /** `personal` is the person's own key; `deployment` is the operator's. */
  source: 'personal' | 'deployment' | null
  last4?: string
  updatedAtMs?: number
  verified?: boolean
}

const credentialsKey = ['theorem', 'credentials'] as const

export const credentialsQuery = queryOptions({
  queryKey: credentialsKey,
  queryFn: async () =>
    (await theoremJson<{ credentials: Credential[] }>('/api/chat/v1/credentials'))
      .credentials,
  retry: (count, error) => !isNotServed(error) && count < 2,
})

export function useCredential(provider: string) {
  const query = useQuery(credentialsQuery)
  return { ...query, data: query.data?.find((c) => c.provider === provider) }
}

/** Saves a key (Theorem checks it with the provider first) or removes the person's own. */
export function useCredentialMutations(provider: string) {
  const queryClient = useQueryClient()
  const settle = () => queryClient.invalidateQueries({ queryKey: credentialsKey })
  const path = `/api/chat/v1/credentials/${encodeURIComponent(provider)}`
  const save = useMutation({
    mutationFn: (apiKey: string) =>
      mutate((headers) =>
        theoremJson<Credential>(path, { method: 'PUT', headers, body: { apiKey } }),
      ),
    onSettled: settle,
  })
  const remove = useMutation({
    mutationFn: () =>
      mutate((headers) => theoremJson<void>(path, { method: 'DELETE', headers })),
    onSettled: settle,
  })
  return { save, remove }
}
