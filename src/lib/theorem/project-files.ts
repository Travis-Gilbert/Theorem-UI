// SOURCING: @tanstack/react-query (server state for the project file tree via @theoremharness/sdk projectFiles), zustand (the dock's open-file bridge, as artifact-view does for artifacts)
import { queryOptions, useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { TheoremError } from '@theoremharness/sdk'
import { theorem } from './client'
import type { Theorem } from './client'

export type FileEntry = Theorem.ProjectFileEntry

export const fileRootQuery = (projectId: string) =>
  queryOptions({
    queryKey: ['theorem', 'project-files', projectId, 'root'],
    queryFn: () => theorem().projectFiles.root({ projectId }),
    staleTime: 30_000,
    // An unconfigured or refused root will not fix itself on a retry.
    retry: false,
  })

export const fileChildrenQuery = (projectId: string, path: string) =>
  queryOptions({
    queryKey: ['theorem', 'project-files', projectId, 'children', path],
    queryFn: async () =>
      (await theorem().projectFiles.children({ projectId, path })).entries,
    staleTime: 30_000,
  })

export const fileContentQuery = (projectId: string, path: string) =>
  queryOptions({
    queryKey: ['theorem', 'project-files', projectId, 'content', path],
    queryFn: () => theorem().projectFiles.content({ projectId, path }),
    staleTime: 10_000,
  })

export function useFileRoot(projectId: string | undefined) {
  return useQuery({
    ...fileRootQuery(projectId ?? ''),
    enabled: !!projectId,
  })
}

/** The server answers 503 project_files_unconfigured until it is started with a project root. */
export function isUnconfigured(error: unknown): boolean {
  if (!(error instanceof TheoremError)) return false
  const body = error.body as Partial<Theorem.Problem> | undefined
  return body?.code === 'project_files_unconfigured'
}

/** Lets the sidebar's explorer open a file in the dock, which owns the panels. */
export const useFileDock = create<{ open?: (path: string) => void }>(
  () => ({}),
)
