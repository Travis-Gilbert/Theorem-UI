// SOURCING: @tanstack/react-query (the effective chat, agent and decision bindings Theorem serves at /api/chat/v1/roles, through lib/theorem/passthrough; Theorem resolves them, the UI only shows the answer and its reason)
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mutate } from './client'
import { isNotServed, theoremJson } from './passthrough'

/** Where a binding came from, most specific first. */
export type RoleSource = 'turn' | 'user' | 'tenant' | 'operator' | 'shipped'

/** Why a role cannot run right now. */
export type RoleUnavailable = 'credential_missing' | 'model_unknown' | 'none_selected'

type RoleState = {
  source: RoleSource
  available: boolean
  reason?: RoleUnavailable
}

/** Something Theorem does only when a decision model is bound. */
export type DecisionFeature = { id: string; label: string; description: string }

export type Roles = {
  /** The model a turn converses on. */
  chat: RoleState & { model: string }
  /** The models the agent and the mixture run on, shared by the whole organization. */
  agent: RoleState & { models: string[]; editable: boolean }
  /** The optional decision model, and the features it turns on. */
  decision: RoleState & { model?: string; features: DecisionFeature[] }
}

export const rolesKey = ['theorem', 'roles'] as const

export const rolesQuery = queryOptions({
  queryKey: rolesKey,
  queryFn: async () => (await theoremJson<{ roles: Roles }>('/api/chat/v1/roles')).roles,
  retry: (count, error) => !isNotServed(error) && count < 2,
})

export function useRoles() {
  return useQuery(rolesQuery)
}

/** Sets the organization's agent pool. Theorem answers 403 to a person who may not rebind roles. */
export function useAgentPoolMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (models: readonly string[]) =>
      mutate((headers) =>
        theoremJson<{ roles: Roles }>('/api/chat/v1/roles/agent', {
          method: 'PUT',
          headers,
          body: { models },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: rolesKey }),
  })
}

const UNAVAILABLE: Record<RoleUnavailable, string> = {
  credential_missing: 'needs a key for its connection',
  model_unknown: 'is no longer in the model list',
  none_selected: 'is turned off',
}

/** Why a role is not running, as a phrase after the model's name. */
export function describeUnavailable(reason: RoleUnavailable | undefined): string {
  return reason ? UNAVAILABLE[reason] : 'cannot run right now'
}

const SOURCES: Record<RoleSource, string> = {
  turn: 'this turn',
  user: 'your choice',
  tenant: "your organization's choice",
  operator: "your Theorem's default",
  shipped: "Theorem's default",
}

/** Where a binding came from, as the settings page says it. */
export const describeSource = (source: RoleSource) => SOURCES[source]
