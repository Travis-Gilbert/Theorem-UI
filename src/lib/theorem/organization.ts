// SOURCING: @tanstack/react-query over lib/theorem/passthrough (the routes in docs/plans/thread-organization-and-review.md, which the vendored SDK has no client for yet), @theoremharness/sdk projects.list and threads.list for a Theorem that predates those routes. The membership and Librarian rules are translated from mikecann/threadbear@78b77e1 (MIT, Mike Cann); Theorem enforces them, this only reads and asks.
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useMemo } from 'react'
import { useShell } from '@/components/shell/shell-state'
import { documentThreadIds } from '@/lib/documents/ask-store'
import { mutate, mutateProject, mutateThread, theorem } from './client'
import type { MutationHeaders, Theorem } from './client'
import { isNotServed, theoremJson } from './passthrough'

export type Actor = 'user' | 'agent' | 'librarian'

export type Membership = {
  projectId: string
  by: Actor
  pinned: boolean
  why: string
  atMs: number
  /** Comes from homeProjectId rather than a stored record. */
  implicit?: boolean
}

export type AttentionReason =
  | {
      kind: 'review'
      reviewId: string
      title: string
      optionCount: number
      atMs: number
    }
  | {
      kind: 'approval'
      runId: string
      approvalId: string
      toolName: string
      atMs: number
    }
  | { kind: 'failed'; runId: string; atMs: number }
  | { kind: 'pending_turn'; messageId: string; atMs: number }

export type Attention = {
  /** Non-empty puts the thread in Attention Worthy. */
  reasons: AttentionReason[]
  /** A run is active on the authority. Puts the thread in Running. */
  running: boolean
  runId?: string
}

export type LaterCondition =
  | { kind: 'time'; atMs: number }
  | { kind: 'thread'; threadId: string; event: 'run_ended' }

export type Later = {
  condition: LaterCondition
  note?: string
  setAtMs: number
  by: Actor
}

/** The Librarian's word on what a thread or project is about, shown as its icon. */
export type Glyph =
  | 'layout'
  | 'code'
  | 'stack'
  | 'graph'
  | 'doc'
  | 'data'
  | 'image'
  | 'terminal'
  | 'bug'
  | 'research'
  | 'map'
  | 'chat'
  | 'todo'

export type ThreadEntry = {
  threadId: string
  title: string
  glyph?: Glyph
  homeProjectId: string
  revision: number
  createdAtMs: number
  lastMessageAtMs?: number
  origin?: Theorem.ThreadOrigin
  memberships: Membership[]
  summary?: { text: string; atMs: number; by: Actor }
  attention: Attention
  later?: Later
}

export type ProjectEntry = {
  projectId: string
  title: string
  glyph?: Glyph
  isInbox: boolean
  createdBy: Actor
  threadCount: number
  outputCount: number
  state?: { text: string; atMs: number; by: Actor }
  brief: boolean
}

export type OrganizeEvent = {
  eventId: string
  atMs: number
  actor: Actor
  kind:
    | 'joined'
    | 'left'
    | 'project_created'
    | 'state_updated'
    | 'thread_summarized'
    | 'set_later'
    | 'woke'
    | 'undone'
  threadId?: string
  threadTitle?: string
  projectId?: string
  projectTitle?: string
  text: string
  why: string
  trigger?:
    | 'first_message'
    | 'turn_completed'
    | 'moved'
    | 'new_repo'
    | 'catch_up'
    | 'placement'
  evidence?: { messageIds: string[]; inputChars: number; model?: string }
  reversible: boolean
  undoneByEventId?: string
}

export type LibrarianStatus = {
  state: 'idle' | 'working' | 'paused' | 'off'
  paused: boolean
  offReason?: string
  jobs: {
    membership: { enabled: boolean; model?: string }
    summary: { enabled: boolean; model?: string }
  }
  queued: number
  /** Newest first, at most 20. */
  recent: OrganizeEvent[]
}

export type Organization = {
  schema: 'theorem-organization/1'
  projects: ProjectEntry[]
  threads: ThreadEntry[]
  librarian: LibrarianStatus
}

export type ProjectOutput = {
  outputId: string
  kind: 'app' | 'artifact' | 'upload' | 'review'
  title: string
  threadId: string
  artifactId?: string
  revision?: unknown
  revisionCount: number
  updatedAtMs: number
  documentId?: string
  uploadId?: string
  reviewId?: string
}

/** What the sidebar reads: the organization, and whether this Theorem serves the routes that change it. */
export type OrganizationRead = Organization & { served: boolean }

const BASE = '/api/chat/v1'
const threadPath = (threadId: string) =>
  `${BASE}/threads/${encodeURIComponent(threadId)}`

export const organizationKey = ['theorem', 'organization'] as const
const outputsKey = (projectId: string) =>
  ['theorem', 'project-outputs', projectId] as const
const historyKey = (filter: object) =>
  ['theorem', 'librarian-history', filter] as const

const byTitle = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })

/** Theorem's rule for the tenant's default home: marked `inbox`, else the oldest. */
export const inboxOf = (projects: readonly Theorem.Project[]) =>
  projects.find((p) => p.provenance === 'inbox') ??
  [...projects].sort((a, b) => a.createdAtMs - b.createdAtMs)[0]

/**
 * The same shape from the routes every Theorem serves, for one that predates
 * the organization routes: home projects, run state and failures are real and
 * nothing else exists to show.
 */
export function organizationFromThreads(
  projects: Theorem.Project[],
  threads: Theorem.Thread[],
): OrganizationRead {
  const inbox = inboxOf(projects)
  const entries = threads
    .filter((thread) => thread.status === 'regular')
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((thread): ThreadEntry => {
      const atMs = thread.lastRun?.endedAtMs ?? thread.updatedAtMs
      const failed = thread.lastRun?.outcome === 'failed' && !thread.activeRunId
      return {
        threadId: thread.threadId,
        title: thread.title,
        homeProjectId: thread.projectId,
        revision: thread.revision,
        createdAtMs: thread.createdAtMs,
        lastMessageAtMs: thread.lastMessageAtMs,
        origin: thread.origin,
        memberships:
          thread.projectId === inbox?.projectId
            ? []
            : [
                {
                  projectId: thread.projectId,
                  by: 'user',
                  pinned: false,
                  why: '',
                  atMs: thread.createdAtMs,
                  implicit: true,
                },
              ],
        attention: {
          reasons: failed
            ? [{ kind: 'failed', runId: thread.lastRun?.runId ?? '', atMs }]
            : [],
          running: Boolean(thread.activeRunId),
          runId: thread.activeRunId ?? undefined,
        },
      }
    })
  return {
    schema: 'theorem-organization/1',
    served: false,
    projects: projects
      .map((project): ProjectEntry => ({
        projectId: project.projectId,
        title: project.title,
        isInbox: project.projectId === inbox?.projectId,
        createdBy: 'user',
        threadCount: entries.filter((entry) =>
          entry.memberships.some((m) => m.projectId === project.projectId),
        ).length,
        outputCount: 0,
        brief: Boolean(project.instructions.trim()),
      }))
      .sort(byTitle),
    threads: entries,
    librarian: {
      state: 'off',
      paused: false,
      jobs: {
        membership: { enabled: false },
        summary: { enabled: false },
      },
      queued: 0,
      recent: [],
    },
  }
}

async function readOrganization(): Promise<OrganizationRead> {
  try {
    const organization = await theoremJson<Organization>(`${BASE}/organization`)
    return { ...organization, served: true }
  } catch (error) {
    if (!isNotServed(error)) throw error
  }
  const client = theorem()
  const projects = (await client.chat.projects.list({ limit: 100 })).items
  const pages = await Promise.all(
    projects.map((project) =>
      client.chat.threads.list({ projectId: project.projectId, limit: 100 }),
    ),
  )
  return organizationFromThreads(
    projects,
    pages.flatMap((page) => page.items),
  )
}

export const organizationQuery = () =>
  queryOptions({
    queryKey: organizationKey,
    queryFn: readOrganization,
    staleTime: 2_000,
    // A run or a Librarian look ends on the server without telling this tab.
    refetchInterval: (query) => {
      const data = query.state.data
      const busy =
        data?.librarian.state === 'working' ||
        data?.threads.some((thread) => thread.attention.running)
      return busy ? 4_000 : 15_000
    },
  })

export const useOrganization = () => useQuery(organizationQuery())

/** The organization's views for this tab, leaving out the threads that belong to a terminal or a document. */
export function useOrganizedViews() {
  const { data } = useOrganization()
  const terminalThreads = useShell((state) => state.terminalThreadIds)
  return useMemo(
    () =>
      organizedViews(
        data ?? { projects: [], threads: [] },
        new Set([...terminalThreads, ...documentThreadIds()]),
      ),
    [data, terminalThreads],
  )
}

export type OrganizedViews = {
  attention: ThreadEntry[]
  running: ThreadEntry[]
  later: ThreadEntry[]
  projects: Array<{ project: ProjectEntry; threads: ThreadEntry[] }>
  unsorted: ThreadEntry[]
  byId: ReadonlyMap<string, ThreadEntry>
}

/**
 * The quick views and the tree: every view reads the same threads, and sorting
 * is by title and creation time, so a badge changing never moves a row.
 * `apart` holds threads that live elsewhere (the agent terminal's, a note's).
 */
export function organizedViews(
  organization: Pick<Organization, 'projects' | 'threads'>,
  apart: ReadonlySet<string> = new Set(),
): OrganizedViews {
  const threads = organization.threads.filter((t) => !apart.has(t.threadId))
  return {
    attention: threads.filter((t) => t.attention.reasons.length > 0),
    running: threads.filter((t) => t.attention.running),
    later: threads.filter((t) => t.later),
    projects: organization.projects
      .filter((project) => !project.isInbox)
      .map((project) => ({
        project,
        threads: threads.filter((thread) =>
          thread.memberships.some((m) => m.projectId === project.projectId),
        ),
      })),
    unsorted: threads.filter((thread) => thread.memberships.length === 0),
    byId: new Map(threads.map((thread) => [thread.threadId, thread])),
  }
}

/** When a session last moved: its last message, else when it began. */
export const lastMoved = (thread: ThreadEntry) =>
  thread.lastMessageAtMs ?? thread.createdAtMs

export type SessionLists = {
  /** Projects the user made, each with its sessions, in the organization's order. */
  sections: Array<{ project: ProjectEntry; threads: ThreadEntry[] }>
  /** Every session in none of those sections, newest first. */
  recent: ThreadEntry[]
  /** Sessions waiting on a person's review or approval, newest first. */
  review: ThreadEntry[]
  /** Where each session's highlight sits: its primary section if the user made it, its first such section, else `recent`. */
  home: ReadonlyMap<string, string>
}

/**
 * The IDE's sidebar over the same views: the sections the user made, and the
 * rest as Recent. Sections keep the tree's stable order; Recent is by when a
 * session last moved, since that is what it lists.
 */
export function sessionLists(views: OrganizedViews): SessionLists {
  const sections = views.projects.filter(
    ({ project }) => project.createdBy === 'user',
  )
  const inSection = new Set(sections.map(({ project }) => project.projectId))
  const threads = [...views.byId.values()]
  const home = new Map<string, string>()
  for (const thread of threads) {
    const placed = thread.memberships
      .map((m) => m.projectId)
      .filter((projectId) => inSection.has(projectId))
    const primary = primaryProjectId(thread)
    home.set(
      thread.threadId,
      placed.includes(primary) ? primary : (placed[0] ?? 'recent'),
    )
  }
  const newestFirst = (a: ThreadEntry, b: ThreadEntry) =>
    lastMoved(b) - lastMoved(a)
  return {
    sections,
    recent: threads
      .filter((thread) => home.get(thread.threadId) === 'recent')
      .sort(newestFirst),
    review: threads
      .filter((thread) =>
        thread.attention.reasons.some(
          (reason) => reason.kind === 'review' || reason.kind === 'approval',
        ),
      )
      .sort(newestFirst),
    home,
  }
}

/**
 * The project a thread is shown as belonging to: one a person or agent placed
 * it in first, then the oldest membership, then its home.
 */
export function primaryProjectId(thread: ThreadEntry) {
  const [first] = [...thread.memberships].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || a.atMs - b.atMs,
  )
  return first?.projectId ?? thread.homeProjectId
}

/** A forked or continued thread sits under its source when the source is in the same list. */
export function nestByOrigin(threads: readonly ThreadEntry[]) {
  const here = new Set(threads.map((thread) => thread.threadId))
  const children = new Map<string, ThreadEntry[]>()
  const roots: ThreadEntry[] = []
  for (const thread of threads) {
    const source = thread.origin?.threadId
    if (source && source !== thread.threadId && here.has(source))
      children.set(source, [...(children.get(source) ?? []), thread])
    else roots.push(thread)
  }
  return { roots, children } as const
}

/** The root a thread nests under in this list, by following its origins up. */
export function rootOf(threads: readonly ThreadEntry[], threadId: string) {
  const byId = new Map(threads.map((thread) => [thread.threadId, thread]))
  const seen = new Set<string>()
  let at = threadId
  while (!seen.has(at)) {
    seen.add(at)
    const source = byId.get(at)?.origin?.threadId
    if (!source || !byId.has(source)) break
    at = source
  }
  return at
}

/** The one phrase a row's badge says about why this thread wants a person. */
export function attentionLabel(reason: AttentionReason) {
  switch (reason.kind) {
    case 'review':
      return 'Review'
    case 'approval':
      return 'Approve'
    case 'failed':
      return 'Failed'
    case 'pending_turn':
      return 'Queued'
  }
}

const invalidate = (client: ReturnType<typeof useQueryClient>) =>
  client.invalidateQueries({ queryKey: organizationKey })

const sendJson = <T>(
  path: string,
  method: string,
  body?: unknown,
  extra?: (headers: MutationHeaders) => Record<string, string>,
) =>
  mutate((headers) =>
    theoremJson<T>(path, {
      method,
      body,
      headers: { ...headers, ...extra?.(headers) },
    }),
  )

export type PlacementChange = {
  add?: string[]
  remove?: string[]
  pin?: string[]
  unpin?: string[]
  why?: string
}

/** What a person's placement does to the thread, so the row moves before the answer. */
export function applyPlacement(
  memberships: readonly Membership[],
  change: PlacementChange,
  atMs: number,
): Membership[] {
  const removed = new Set(change.remove)
  const kept = memberships.filter((m) => !removed.has(m.projectId))
  const added = (change.add ?? [])
    .filter((id) => !kept.some((m) => m.projectId === id))
    .map((projectId): Membership => ({
      projectId,
      by: 'user',
      pinned: true,
      why: change.why ?? '',
      atMs,
    }))
  return [...kept, ...added].map((m) =>
    change.pin?.includes(m.projectId)
      ? { ...m, pinned: true }
      : change.unpin?.includes(m.projectId)
        ? { ...m, pinned: false }
        : m,
  )
}

/** Places a thread in projects, removes it, pins it. Theorem keeps the correction. */
/**
 * Told when Theorem refuses a change. It runs even after the caller unmounts,
 * so a menu that closed on the click can still say why nothing moved.
 */
type Refusal = { onError?: (error: Error) => void }

export function usePlacement({ onError }: Refusal = {}) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      threadId,
      change,
    }: {
      threadId: string
      change: PlacementChange
    }) =>
      sendJson<{ thread: ThreadEntry; event: OrganizeEvent }>(
        `${threadPath(threadId)}/placement`,
        'POST',
        change,
      ),
    onMutate: async ({ threadId, change }) => {
      await client.cancelQueries({ queryKey: organizationKey })
      const previous = client.getQueryData<OrganizationRead>(organizationKey)
      if (previous) {
        const atMs = Date.now()
        client.setQueryData<OrganizationRead>(organizationKey, {
          ...previous,
          threads: previous.threads.map((thread) =>
            thread.threadId === threadId
              ? {
                  ...thread,
                  memberships: applyPlacement(thread.memberships, change, atMs),
                }
              : thread,
          ),
        })
      }
      return { previous }
    },
    onError: (error, _input, context) => {
      if (context?.previous)
        client.setQueryData(organizationKey, context.previous)
      onError?.(error)
    },
    onSettled: () => invalidate(client),
  })
}

/** What moving a thread to `projectId` makes of it on a Theorem without placement: a new home. */
export function rehome(
  thread: ThreadEntry,
  projectId: string,
  inboxId: string | undefined,
): ThreadEntry {
  return {
    ...thread,
    homeProjectId: projectId,
    memberships:
      projectId === inboxId
        ? []
        : [
            {
              projectId,
              by: 'user',
              pinned: false,
              why: '',
              atMs: thread.createdAtMs,
              implicit: true,
            },
          ],
  }
}

export type MovePlan =
  | { kind: 'placement'; change: PlacementChange }
  | { kind: 'home'; projectId: string }

/**
 * What moving a thread from where it is listed (`from`) to a project, or out
 * of every project (`to` null), asks of Theorem; nothing when it is already
 * there. Where placement is served it is a placement a person made, which the
 * Librarian keeps; elsewhere it changes the thread's home.
 */
export function planMove(
  organization: OrganizationRead,
  thread: ThreadEntry,
  from: string | undefined,
  to: string | null,
): MovePlan | undefined {
  const members = thread.memberships.map((m) => m.projectId)
  if (organization.served) {
    if (to === null)
      return members.length
        ? { kind: 'placement', change: { remove: members } }
        : undefined
    const leaving = from && from !== to && members.includes(from) ? [from] : []
    if (members.includes(to) && !leaving.length) return undefined
    return { kind: 'placement', change: { add: [to], remove: leaving } }
  }
  const projectId =
    to ?? organization.projects.find((p) => p.isInbox)?.projectId
  if (!projectId || projectId === thread.homeProjectId) return undefined
  return { kind: 'home', projectId }
}

/** Moves a thread as {@link planMove} says, showing the move before Theorem answers. */
export function useMoveThread({ onError }: Refusal = {}) {
  const client = useQueryClient()
  const placement = usePlacement({ onError })
  const home = useMutation({
    mutationFn: ({
      threadId,
      projectId,
    }: {
      threadId: string
      projectId: string
    }) =>
      mutateThread(threadId, (headers) =>
        theorem().chat.threads.update({ threadId, projectId, ...headers }),
      ),
    onMutate: async ({ threadId, projectId }) => {
      await client.cancelQueries({ queryKey: organizationKey })
      const previous = client.getQueryData<OrganizationRead>(organizationKey)
      if (previous) {
        const inboxId = previous.projects.find((p) => p.isInbox)?.projectId
        client.setQueryData<OrganizationRead>(organizationKey, {
          ...previous,
          threads: previous.threads.map((thread) =>
            thread.threadId === threadId
              ? rehome(thread, projectId, inboxId)
              : thread,
          ),
        })
      }
      return { previous }
    },
    onError: (error, _input, context) => {
      if (context?.previous)
        client.setQueryData(organizationKey, context.previous)
      onError?.(error)
    },
    onSettled: () => invalidate(client),
  })

  const move = (
    thread: ThreadEntry,
    from: string | undefined,
    to: string | null,
  ) => {
    const organization = client.getQueryData<OrganizationRead>(organizationKey)
    const plan = organization && planMove(organization, thread, from, to)
    if (plan?.kind === 'placement')
      placement.mutate({ threadId: thread.threadId, change: plan.change })
    if (plan?.kind === 'home')
      home.mutate({ threadId: thread.threadId, projectId: plan.projectId })
  }

  return { move, error: placement.error ?? home.error }
}

/** Reverses one Librarian decision; Theorem records the correction so it holds. */
export function useUndoOrganize() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (eventId: string) =>
      sendJson<{ event: OrganizeEvent }>(
        `${BASE}/librarian/events/${encodeURIComponent(eventId)}/undo`,
        'POST',
      ),
    onSettled: () =>
      Promise.all([
        invalidate(client),
        client.invalidateQueries({
          queryKey: ['theorem', 'librarian-history'],
        }),
      ]),
  })
}

export function useLater({ onError }: Refusal = {}) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      threadId,
      condition,
      note,
    }: {
      threadId: string
      condition: LaterCondition | null
      note?: string
    }) =>
      condition
        ? sendJson(`${threadPath(threadId)}/later`, 'PUT', { condition, note })
        : sendJson(`${threadPath(threadId)}/later`, 'DELETE'),
    onError,
    onSettled: () => invalidate(client),
  })
}

/** Opening a thread clears a failure's claim on a person's attention. */
export function useMarkSeen() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (threadId: string) =>
      sendJson(`${threadPath(threadId)}/seen`, 'POST'),
    onSuccess: () => invalidate(client),
  })
}

export function useLibrarianControl() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (change: {
      paused?: boolean
      jobs?: Partial<LibrarianStatus['jobs']>
    }) => sendJson<LibrarianStatus>(`${BASE}/librarian`, 'PATCH', change),
    onSettled: () => invalidate(client),
  })
}

export function useLibrarianHistory(
  filter: { threadId?: string; projectId?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: historyKey(filter),
    enabled,
    queryFn: () => {
      const query = new URLSearchParams({ limit: '50' })
      if (filter.threadId) query.set('threadId', filter.threadId)
      if (filter.projectId) query.set('projectId', filter.projectId)
      return theoremJson<{ items: OrganizeEvent[]; nextCursor?: string }>(
        `${BASE}/librarian/history?${query}`,
      )
    },
  })
}

export function useProjectOutputs(projectId: string | undefined) {
  return useQuery({
    queryKey: outputsKey(projectId ?? ''),
    enabled: projectId !== undefined,
    queryFn: () =>
      theoremJson<{ items: ProjectOutput[]; total: number }>(
        `${BASE}/projects/${encodeURIComponent(projectId!)}/outputs`,
      ),
  })
}

/** A person's own word on where a project stands, or null to hand it back. */
export function useProjectState() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      text,
    }: {
      projectId: string
      text: string | null
    }) =>
      sendJson(
        `${BASE}/projects/${encodeURIComponent(projectId)}/state`,
        'PATCH',
        { text },
      ),
    onSettled: () => invalidate(client),
  })
}

/**
 * A section's edits: a new title, or archiving its project, which takes the
 * section away and sends its sessions back to Recent. Theorem has no way to
 * delete a project, and archiving keeps it to restore.
 */
export function useProjectEdits() {
  const client = useQueryClient()
  const settled = () =>
    Promise.all([
      invalidate(client),
      client.invalidateQueries({ queryKey: ['theorem', 'projects'] }),
    ])
  const update = (
    projectId: string,
    change: { title?: string; archived?: boolean },
  ) =>
    mutateProject(projectId, (headers) =>
      theorem().chat.projects.update({ projectId, ...change, ...headers }),
    )
  return {
    rename: useMutation({
      mutationFn: ({
        projectId,
        title,
      }: {
        projectId: string
        title: string
      }) => update(projectId, { title }),
      onSettled: settled,
    }),
    archive: useMutation({
      mutationFn: (projectId: string) => update(projectId, { archived: true }),
      onSettled: settled,
    }),
  }
}

/** The thread edits the sidebar's rows make, each followed by a fresh tree. */
export function useThreadEdits() {
  const client = useQueryClient()
  const settled = () => invalidate(client)
  return {
    rename: useMutation({
      mutationFn: ({ threadId, title }: { threadId: string; title: string }) =>
        mutateThread(threadId, (headers) =>
          theorem().chat.threads.update({ threadId, title, ...headers }),
        ),
      onSettled: settled,
    }),
    archive: useMutation({
      mutationFn: (threadId: string) =>
        mutateThread(threadId, (headers) =>
          theorem().chat.threads.update({
            threadId,
            archived: true,
            ...headers,
          }),
        ),
      onSettled: settled,
    }),
    remove: useMutation({
      mutationFn: (threadId: string) =>
        mutateThread(threadId, (headers) =>
          theorem().chat.threads.delete({ threadId, ...headers }),
        ),
      onSettled: settled,
    }),
  }
}
