// SOURCING: none: the content of docs/plans/evidence/refs/sidebar-compare@2026-11-05.webp, typed against lib/theorem/organization so it cannot drift from the contract.
import type {
  Membership,
  Organization,
  OrganizeEvent,
  ProjectEntry,
  ThreadEntry,
} from '@/lib/theorem/organization'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const project = (
  projectId: string,
  title: string,
  threadCount: number,
  extra: Partial<ProjectEntry> = {},
): ProjectEntry => ({
  projectId,
  title,
  isInbox: false,
  createdBy: 'librarian',
  threadCount,
  outputCount: 0,
  brief: false,
  ...extra,
})

const joined = (projectId: string, at: number, why: string): Membership => ({
  projectId,
  by: 'librarian',
  pinned: false,
  why,
  atMs: at,
})

export function organizationFixture(now: number): Organization {
  const thread = (
    threadId: string,
    title: string,
    home: string,
    extra: Partial<ThreadEntry> = {},
  ): ThreadEntry => ({
    threadId,
    title,
    homeProjectId: home,
    revision: 1,
    createdAtMs: now - 3 * HOUR,
    lastMessageAtMs: now - HOUR,
    memberships: [joined(home, now - 2 * HOUR, `Its work is about ${title}.`)],
    attention: { reasons: [], running: false },
    ...extra,
  })
  const filed: OrganizeEvent = {
    eventId: 'event-filed-sdk',
    atMs: now - 20_000,
    actor: 'librarian',
    kind: 'joined',
    threadId: 'thread-python-sdk',
    threadTitle: 'Python SDK',
    projectId: 'project-theorem',
    projectTitle: 'Theorem',
    text: 'Filed Python SDK in Theorem',
    why: 'It adds a Python client for the Theorem chat routes, and the conversation names this repository.',
    trigger: 'first_message',
    reversible: true,
  }
  const others: OrganizeEvent[] = [
    {
      ...filed,
      eventId: 'event-filed-loop',
      atMs: now - 40_000,
      threadId: 'thread-learning-loop',
      threadTitle: 'PR learning loop',
      text: 'Filed PR learning loop in Theorem',
    },
    {
      ...filed,
      eventId: 'event-filed-atlas',
      atMs: now - 55_000,
      threadId: 'thread-atlas-map',
      threadTitle: 'Tract boundaries',
      projectId: 'project-atlas',
      projectTitle: 'Our Civic Atlas',
      text: 'Filed Tract boundaries in Our Civic Atlas',
    },
  ]
  const review = {
    kind: 'review',
    reviewId: 'review-app-gallery',
    title: 'App gallery',
    optionCount: 2,
    atMs: now - 8 * MINUTE,
  } as const
  const inTheorem = [
    thread('thread-app-gallery', 'App gallery layout', 'project-theorem', {
      glyph: 'layout',
      attention: { reasons: [review], running: false },
      lastMessageAtMs: now - 8 * MINUTE,
    }),
    thread('thread-python-sdk', 'Python SDK', 'project-theorem', {
      glyph: 'code',
      attention: { reasons: [], running: true, runId: 'run-sdk' },
    }),
    thread('thread-learning-loop', 'PR learning loop', 'project-theorem', {
      glyph: 'stack',
    }),
    thread('thread-graph-memory', 'Graph memory', 'project-theorem', {
      glyph: 'graph',
    }),
    ...Array.from({ length: 8 }, (_, index) =>
      thread(`thread-theorem-${index}`, `Earlier thread ${index + 1}`, 'project-theorem', {
        lastMessageAtMs: now - (24 + index) * HOUR,
      }),
    ),
  ]
  const inPlatinum = Array.from({ length: 8 }, (_, index) =>
    thread(`thread-platinum-${index}`, `Platinum thread ${index + 1}`, 'project-platinum', {
      attention:
        index === 0
          ? { reasons: [], running: true, runId: 'run-platinum' }
          : { reasons: [], running: false },
    }),
  )
  const inAtlas = Array.from({ length: 6 }, (_, index) =>
    thread(`thread-atlas-${index}`, `Atlas thread ${index + 1}`, 'project-atlas', {
      attention:
        index === 0
          ? { reasons: [], running: true, runId: 'run-atlas' }
          : index === 1
            ? { reasons: [{ kind: 'failed', runId: 'run-atlas-2', atMs: now - 30 * MINUTE }], running: false }
            : { reasons: [], running: false },
    }),
  )
  const later = (threadEntry: ThreadEntry, hours: number): ThreadEntry => ({
    ...threadEntry,
    later: {
      condition: { kind: 'time', atMs: now + hours * HOUR },
      setAtMs: now - HOUR,
      by: 'user',
    },
  })
  inTheorem[10] = later(inTheorem[10]!, 3)
  inTheorem[11] = later(inTheorem[11]!, 24)
  inPlatinum[6] = later(inPlatinum[6]!, 48)
  inAtlas[5] = later(inAtlas[5]!, 72)
  const unsorted = [
    thread('thread-unsorted-1', 'Quick question about tokens', 'project-inbox', {
      memberships: [],
    }),
    thread('thread-unsorted-2', 'Scratch', 'project-inbox', { memberships: [] }),
  ]
  return {
    schema: 'theorem-organization/1',
    projects: [
      project('project-theorem', 'Theorem', inTheorem.length, {
        outputCount: 5,
        brief: true,
        state: {
          text: '- The gallery direction is waiting on a choice.\n- The Python SDK is being generated.',
          atMs: now - 10 * MINUTE,
          by: 'librarian',
        },
      }),
      project('project-platinum', 'Platinum', inPlatinum.length, {
        glyph: 'stack',
      }),
      project('project-atlas', 'Our Civic Atlas', inAtlas.length, {
        glyph: 'map',
      }),
      project('project-inbox', 'Inbox', unsorted.length, { isInbox: true }),
    ],
    threads: [...inTheorem, ...inPlatinum, ...inAtlas, ...unsorted],
    librarian: {
      state: 'idle',
      paused: false,
      jobs: { membership: { enabled: true }, summary: { enabled: true } },
      queued: 0,
      recent: [filed, ...others],
    },
  }
}
