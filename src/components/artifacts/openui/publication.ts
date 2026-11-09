// SOURCING: @tanstack/react-query (read once, publish when stale), the Index's
// response reader and GET helper over platform fetch, the shared
// CSRF/idempotency helper from lib/theorem/client; the same publication the
// Index makes for its library (components/index/queries).
//
// Theorem keeps the record of the library this build renders (its prompt,
// names, signatures and version), so the agent writes programs this build can
// show and the backend can check one before it publishes it.
import { useQuery } from '@tanstack/react-query'
import { hasStatus, isSignedOut, mutate } from '@/lib/theorem/client'
import { get, read } from '@/components/index/api'
import { LIBRARY_ID, LIBRARY_VERSION, libraryRecord } from './library'
import type { LibraryRecord } from './library'

export const LIBRARY_PATH = `/api/artifacts/v1/libraries/${LIBRARY_ID}`

/** What Theorem answers with; it may leave the prompt out. */
type PublishedLibrary = Omit<LibraryRecord, 'prompt'>

/** The record Theorem holds, or undefined before anything was published. */
export async function readPublished(): Promise<PublishedLibrary | undefined> {
  try {
    return await get<PublishedLibrary>(LIBRARY_PATH)
  } catch (error) {
    if (hasStatus(error, 404)) return undefined
    throw error
  }
}

export const publish = (record: LibraryRecord) =>
  mutate(async (headers) =>
    read<PublishedLibrary>(
      await fetch(LIBRARY_PATH, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(record),
      }),
    ),
  )

/** Publishes this build's record when Theorem's digest differs; answers what Theorem holds. */
export async function syncLibraryRecord() {
  const [published, record] = await Promise.all([
    readPublished(),
    libraryRecord(),
  ])
  if (published?.digest === record.digest) return published
  return publish(record)
}

/** Syncs the record once per session. */
export function useArtifactLibraryPublication() {
  return useQuery({
    queryKey: ['artifact-library', LIBRARY_ID, LIBRARY_VERSION],
    queryFn: syncLibraryRecord,
    staleTime: Infinity,
    retry: (failures, error) => !isSignedOut(error) && failures < 1,
  })
}

export function ArtifactLibraryPublication() {
  useArtifactLibraryPublication()
  return null
}
