// SOURCING: @theoremharness/sdk files (entries, search, read, links, backlinks, suggestions) and documents.get, the typed Files routes (schema theorem-files/1)
import { theorem, statusOf, type Theorem } from '@/lib/theorem'
import { loadProjects, loadThreads } from '@/features/chat/threads'
import { hitsToItems, itemsOf, type LibraryItem } from './model'
import { explicitRelated, suggestedRelated, type Related } from './related'

const FILES = 'theorem-files/1'
const DOCUMENTS = 'theorem-document/2'

export type Vault = { entries: Theorem.FilesEntry[]; items: LibraryItem[] }

/** Every path in the vault: the Library root is built from this one list. */
export async function loadVault(): Promise<Vault> {
  const page = await theorem().files.entries({ schema: FILES })
  return { entries: page.entries, items: itemsOf(page.entries) }
}

/** Full-text search over the vault, as items with an excerpt. */
export async function searchFiles(query: string, items: readonly LibraryItem[]): Promise<LibraryItem[]> {
  const page = await theorem().files.search({ schema: FILES, query, limit: 50 })
  return hitsToItems(page.hits, items)
}

export type FileContent = { encoding: 'utf8' | 'base64'; data: string }

export async function readFile(path: string): Promise<FileContent> {
  const content = await theorem().files.read({ schema: FILES, path })
  return { encoding: content.encoding, data: content.data }
}

export type RelatedResult = {
  linked: Related[]
  suggested: Related[]
  /** Why suggestions are missing, when Theorem says they are not available. */
  suggestionsUnavailable?: string
}

/**
 * Links in both directions from the Files API, and Theorem's own suggestions
 * kept apart from them. Suggestions fail on a stack that has no thresholds
 * configured; that is reported, not hidden.
 */
export async function loadRelated(path: string): Promise<RelatedResult> {
  const client = theorem()
  const [outgoing, incoming, suggestions] = await Promise.all([
    client.files.links({ schema: FILES, path }),
    client.files.backlinks({ schema: FILES, path }),
    client.files.suggestions({ schema: FILES, path, limit: 10 }).then(
      (page) => ({ page }),
      (error: unknown) => ({ error }),
    ),
  ])
  const linked = explicitRelated(path, outgoing.links, incoming.links)
  if ('page' in suggestions) return { linked, suggested: suggestedRelated(suggestions.page.suggestions, path) }
  const status = statusOf(suggestions.error)
  const body = (suggestions.error as { body?: { detail?: string; code?: string } }).body
  return {
    linked,
    suggested: [],
    suggestionsUnavailable:
      status === 422 || status === 404 || status === 501
        ? (body?.detail ?? 'Theorem has not been set up to suggest related items yet.')
        : 'Suggestions did not load.',
  }
}

export type Provenance = {
  /** Where Theorem says this came from: who wrote it, on which surface, at which run. */
  lines: string[]
  /** The conversation that produced it, when one of the user's threads carries that run. */
  thread?: Theorem.Thread
  runId?: string
}

/**
 * What Theorem records about the item's producer. A run id links to a
 * conversation only when a thread of this account carries that run; otherwise
 * the origin is shown and no route is invented.
 */
export async function loadProvenance(documentId: string): Promise<Provenance> {
  const { summary } = await theorem().documents.get({ documentId, schema: DOCUMENTS })
  const lines: string[] = []
  if (summary.origin.kind === 'agent_encoded') {
    lines.push(`Written by ${summary.origin.actorId} on ${summary.origin.originSurface}`)
  } else {
    lines.push('Written by you')
  }
  const runId = summary.actors.find((actor) => actor.runId)?.runId
  if (!runId) return { lines }
  return { lines, runId, thread: await findThreadForRun(runId) }
}

async function findThreadForRun(runId: string): Promise<Theorem.Thread | undefined> {
  const projects = await loadProjects()
  const pages = await Promise.all(projects.map((project) => loadThreads(project.projectId).catch(() => undefined)))
  return pages
    .flatMap((page) => page?.items ?? [])
    .find((thread) => thread.activeRunId === runId || thread.lastRun?.runId === runId)
}
