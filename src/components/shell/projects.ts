// SOURCING: @tanstack/react-query (server state for Theorem projects and the session tenant via @theoremharness/sdk)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bootstrap, isSignedOut, mutate, theorem } from '@/lib/theorem/client'
import type { Theorem } from '@/lib/theorem/client'
import { useShell } from './shell-state'

const PROJECTS = ['theorem', 'projects'] as const

/** Default home for chats when a tenant has no projects yet. */
const DEFAULT_PROJECT = 'Chats'

export function useProjects() {
  return useQuery({
    queryKey: PROJECTS,
    queryFn: async (): Promise<Theorem.Project[]> => {
      const page = await theorem().chat.projects.list({ limit: 100 })
      if (page.items.length) return page.items
      const { record } = await mutate((headers) =>
        theorem().chat.projects.create({ title: DEFAULT_PROJECT, ...headers }),
      )
      return [record]
    },
    staleTime: 60_000,
    // Signed out is an answer, not a failure: the layout shows the sign-in.
    retry: (failures, error) => !isSignedOut(error) && failures < 1,
  })
}

/** The remembered project, or the first one when the remembered id is gone. */
export function useActiveProject() {
  const query = useProjects()
  const projectId = useShell((s) => s.projectId)
  const projects = query.data ?? []
  const project = projects.find((p) => p.projectId === projectId) ?? projects[0]
  return { ...query, projects, project }
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  const setProjectId = useShell((s) => s.setProjectId)
  return useMutation({
    mutationFn: (title: string) =>
      mutate((headers) =>
        theorem().chat.projects.create({ title, ...headers }),
      ),
    onSuccess: ({ record }) => {
      queryClient.setQueryData<Theorem.Project[]>(PROJECTS, (prev = []) => [
        ...prev,
        record,
      ])
      setProjectId(record.projectId)
    },
  })
}

/** The signed-in tenant, from the session bootstrap the client already holds. */
export function useTenant() {
  const { data } = useQuery({
    queryKey: ['theorem', 'bootstrap'],
    queryFn: () => bootstrap(),
    staleTime: Infinity,
  })
  return data?.tenantId
}
