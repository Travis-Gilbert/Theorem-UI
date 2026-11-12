// SOURCING: @theoremharness/sdk chat.projects (list, create) and chat.threads (list, create), the same calls the web client makes (Theorem-UI src/components/shell/projects.ts, src/lib/theorem/runtime.tsx)
import * as Crypto from 'expo-crypto'
import { mutate, theorem, type Theorem } from '@/lib/theorem'

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

export function threadTitle(thread: Theorem.Thread): string {
  return thread.title.trim() || 'New conversation'
}

export function threadDetail(thread: Theorem.Thread): string {
  const when = new Date(thread.lastMessageAtMs ?? thread.updatedAtMs)
  const live = thread.activeRunId ? 'Run in progress · ' : ''
  return `${live}${when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
}
