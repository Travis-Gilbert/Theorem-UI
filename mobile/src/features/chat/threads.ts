// SOURCING: @theoremharness/sdk chat.projects (list, create) and chat.threads (list, create), the same calls the web client makes (Theorem-UI src/components/shell/projects.ts, src/lib/theorem/runtime.tsx)
import * as Crypto from 'expo-crypto'
import { mutate, statusOf, theorem, type Theorem } from '@/lib/theorem'
export { mostRecentThread, threadActivityMs, threadDetail, threadDetails, threadState, threadTitle } from './thread-model'
export type { ThreadState } from './thread-model'

/** The project chats live in when a workspace has none yet; the web client uses the same name. */
const DEFAULT_PROJECT = 'Chats'

export async function loadProjects(): Promise<Theorem.Project[]> {
  const page = await theorem().chat.projects.list({ limit: 100 })
  if (page.items.length) return page.items
  const { record } = await mutate(Crypto.randomUUID(), (headers) =>
    theorem().chat.projects.create({ title: DEFAULT_PROJECT, ...headers }),
  )
  return [record]
}

const THREAD_PAGE = 50

/** One page of a project's threads, newest first; `nextCursor` asks for the page after it. */
export function loadThreads(projectId: string, cursor?: string): Promise<Theorem.ThreadPage> {
  return theorem().chat.threads.list({ projectId, cursor, limit: THREAD_PAGE })
}

/** The key is the caller's, so a repeated press after a lost response makes one thread. */
export async function createThread(projectId: string, key: string): Promise<Theorem.Thread> {
  const { record } = await mutate(key, (headers) => theorem().chat.threads.create({ projectId, ...headers }))
  return record
}

/**
 * The first page of every project's conversations, for search. It lists
 * projects and never creates one (loadProjects does, for Chat).
 */
export async function loadSearchableThreads(): Promise<Array<{ thread: Theorem.Thread; projectTitle: string }>> {
  const projects = await theorem().chat.projects.list({ limit: 100 })
  const pages = await Promise.all(
    projects.items.map(async (project) => {
      const page = await loadThreads(project.projectId)
      return page.items.map((thread) => ({ thread, projectTitle: project.title }))
    }),
  )
  return pages.flat()
}

/** One project, read from the list: projects have no single read, and its revision is the write precondition. */
export async function loadProject(projectId: string): Promise<Theorem.Project | undefined> {
  const page = await theorem().chat.projects.list({ limit: 100 })
  return page.items.find((project) => project.projectId === projectId)
}

/**
 * Writes a project's instructions. The revision just read goes back as
 * If-Match; a stale one (409 or 412) is read again and retried once under its
 * own key, as the web client does. `key` is the caller's, so pressing Save
 * again after a lost response repeats the same write.
 */
export async function saveInstructions(projectId: string, instructions: string, key: string): Promise<Theorem.Project> {
  const attempt = async (attemptKey: string) => {
    const project = await loadProject(projectId)
    if (!project) throw new Error('That project is no longer there.')
    const { record } = await mutate(attemptKey, (headers) =>
      theorem().chat.projects.update({ projectId, instructions, 'If-Match': String(project.revision), ...headers }),
    )
    return record
  }
  try {
    return await attempt(key)
  } catch (error) {
    if (statusOf(error) === 409 || statusOf(error) === 412) return attempt(`${key}:retry`)
    throw error
  }
}
