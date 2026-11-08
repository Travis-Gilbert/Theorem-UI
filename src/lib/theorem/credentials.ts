// SOURCING: @tanstack/react-query (the person's provider keys at /api/chat/v1/credentials and connections at /api/chat/v1/connections, through lib/theorem/passthrough; Theorem stores and verifies keys, the UI never sees one back)
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
const connectionsKey = ['theorem', 'connections'] as const

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
  const settle = () =>
    Promise.all(
      [credentialsKey, connectionsKey, ['theorem', 'roles']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    )
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

/** A way Theorem reaches models: a shipped provider, or an OpenAI-compatible endpoint the person added. */
export type Connection = {
  /** `openrouter`, `anthropic`, `openai`, or `custom:<slug>`. */
  id: string
  label: string
  protocols: readonly string[]
  baseUrl: string
  custom: boolean
  /** Whether its model list is fresh, served from Theorem's cache, or missing. */
  status: 'live' | 'cached' | 'unavailable'
  credential?: Credential
}


export const connectionsQuery = queryOptions({
  queryKey: connectionsKey,
  queryFn: async () =>
    (await theoremJson<{ connections: Connection[] }>('/api/chat/v1/connections'))
      .connections,
  retry: (count, error) => !isNotServed(error) && count < 2,
})

/** Shipped connections first, then the person's own, as Theorem lists them. */
export function useConnections() {
  return useQuery(connectionsQuery)
}

/**
 * Adds an OpenAI-compatible endpoint (Theorem checks the address and lists its
 * models first) or removes one with its key. Either changes the model list too.
 */
export function useConnectionMutations() {
  const queryClient = useQueryClient()
  const settle = () =>
    Promise.all(
      [connectionsKey, credentialsKey, ['theorem', 'models']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    )
  const create = useMutation({
    mutationFn: (input: { label: string; baseUrl: string; apiKey?: string }) =>
      mutate((headers) =>
        theoremJson<Connection>('/api/chat/v1/connections', {
          method: 'POST',
          headers,
          body: input,
        }),
      ),
    onSettled: settle,
  })
  const remove = useMutation({
    mutationFn: (id: string) =>
      mutate((headers) =>
        theoremJson<void>(`/api/chat/v1/connections/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers,
        }),
      ),
    onSettled: settle,
  })
  return { create, remove }
}
