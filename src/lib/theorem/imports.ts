// SOURCING: @tanstack/react-query (a project's imports at /api/chat/v1/projects/:id/imports, through lib/theorem/passthrough; refetch while any import is still running), TheoremClient.fetch for the existing project uploads route that files go through
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TheoremError } from '@theoremharness/sdk'
import { mutate, theorem } from './client'
import { isNotServed, theoremJson } from './passthrough'

export type ImportStatus = 'queued' | 'extracting' | 'indexing' | 'ready' | 'failed'

export type ImportRecord = {
  importId: string
  projectId: string
  kind: 'url' | 'text' | 'upload'
  title: string
  origin?: string
  status: ImportStatus
  error?: { code: string; detail?: string }
  documentId?: string
  chunks?: number
  characters?: number
  createdAtMs: number
  updatedAtMs: number
}

export type ImportSource =
  | { kind: 'url'; url: string }
  | { kind: 'text'; title: string; text: string }
  | { kind: 'upload'; uploadId: string }

const RUNNING: ReadonlySet<ImportStatus> = new Set(['queued', 'extracting', 'indexing'])

export const isRunning = (record: ImportRecord) => RUNNING.has(record.status)

const importsKey = (projectId: string) => ['theorem', 'imports', projectId] as const
const importsPath = (projectId: string) =>
  `/api/chat/v1/projects/${encodeURIComponent(projectId)}/imports`

export const importsQuery = (projectId: string) =>
  queryOptions({
    queryKey: importsKey(projectId),
    queryFn: async () =>
      (await theoremJson<{ items: ImportRecord[] }>(importsPath(projectId))).items,
    retry: (count, error) => !isNotServed(error) && count < 2,
    // Poll while Theorem is still extracting or indexing something.
    refetchInterval: (query) =>
      query.state.data?.some(isRunning) ? 2000 : false,
  })

export function useImports(projectId: string | undefined) {
  return useQuery({ ...importsQuery(projectId ?? ''), enabled: !!projectId })
}

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')

const base64Url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/**
 * Sends a file's bytes to the project's uploads route, the same intake chat
 * attachments use, and returns its upload id for an `upload` import.
 */
export async function uploadFile(
  projectId: string,
  file: File,
): Promise<{ uploadId: string; sha256: string }> {
  const digest = hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
  return mutate(async (headers) => {
    const response = await theorem().fetch(
      `/api/chat/v1/projects/${encodeURIComponent(projectId)}/uploads`,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': file.type || 'application/octet-stream',
          'x-file-name-b64': base64Url(file.name),
          'x-file-size': String(file.size),
          'x-content-sha256': digest,
        },
        body: file,
      },
    )
    const body = (await response.json().catch(() => undefined)) as
      | { record?: { uploadId?: string } }
      | undefined
    const uploadId = body?.record?.uploadId
    if (!response.ok || !uploadId)
      throw new TheoremError({
        message: `Upload of ${file.name} answered ${response.status}`,
        statusCode: response.status,
        body,
      })
    return { uploadId, sha256: digest }
  })
}

export function useImportMutations(projectId: string | undefined) {
  const queryClient = useQueryClient()
  const settle = () =>
    projectId && queryClient.invalidateQueries({ queryKey: importsKey(projectId) })
  const start = useMutation({
    mutationFn: (source: ImportSource) =>
      mutate((headers) =>
        theoremJson<{ import: ImportRecord }>(importsPath(projectId!), {
          method: 'POST',
          headers,
          body: { source },
        }),
      ),
    onSettled: settle,
  })
  const startFile = useMutation({
    mutationFn: async (file: File) => {
      const { uploadId } = await uploadFile(projectId!, file)
      return start.mutateAsync({ kind: 'upload', uploadId })
    },
  })
  const remove = useMutation({
    mutationFn: (importId: string) =>
      mutate((headers) =>
        theoremJson<void>(`${importsPath(projectId!)}/${encodeURIComponent(importId)}`, {
          method: 'DELETE',
          headers,
        }),
      ),
    onSettled: settle,
  })
  return { start, startFile, remove }
}
