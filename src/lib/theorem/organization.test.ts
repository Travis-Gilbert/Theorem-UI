// SOURCING: bun:test over the pure view logic in ./organization
import { describe, expect, test } from 'bun:test'
import {
  applyPlacement,
  nestByOrigin,
  rootOf,
  organizationFromThreads,
  organizedViews,
  planMove,
  primaryProjectId,
  rehome,
  sessionLists,
} from './organization'
import type { Membership, ProjectEntry, ThreadEntry } from './organization'
import type { Theorem } from './client'

const project = (
  projectId: string,
  over: Partial<ProjectEntry> = {},
): ProjectEntry => ({
  projectId,
  title: projectId,
  isInbox: false,
  createdBy: 'user',
  threadCount: 0,
  outputCount: 0,
  brief: false,
  ...over,
})

const member = (
  projectId: string,
  over: Partial<Membership> = {},
): Membership => ({
  projectId,
  by: 'librarian',
  pinned: false,
  why: 'about this',
  atMs: 1,
  ...over,
})

const thread = (
  threadId: string,
  over: Partial<ThreadEntry> = {},
): ThreadEntry => ({
  threadId,
  title: threadId,
  homeProjectId: 'inbox',
  revision: 1,
  createdAtMs: 1,
  memberships: [],
  attention: { reasons: [], running: false },
  ...over,
})

describe('organizedViews', () => {
  const organization = {
    projects: [project('inbox', { isInbox: true }), project('a'), project('b')],
    threads: [
      thread('review', {
        memberships: [member('a'), member('b')],
        attention: {
          reasons: [
            {
              kind: 'review',
              reviewId: 'r',
              title: 't',
              optionCount: 2,
              atMs: 2,
            },
          ],
          running: false,
        },
      }),
      thread('live', {
        memberships: [member('a')],
        attention: { reasons: [], running: true, runId: 'run' },
      }),
      thread('snoozed', {
        later: {
          condition: { kind: 'time', atMs: 9 },
          setAtMs: 1,
          by: 'user',
        },
      }),
      thread('terminal'),
    ],
  }

  test('projects keep the order a person gave them, with the rest after', () => {
    const views = organizedViews(
      { ...organization, projects: [...organization.projects, project('c')] },
      new Set(),
      ['b', 'gone', 'a'],
    )
    expect(views.projects.map((p) => p.project.projectId)).toEqual([
      'b',
      'a',
      'c',
    ])
  })

  test('a thread in two projects shows in each and in its attention view', () => {
    const views = organizedViews(organization)
    expect(views.projects.map((p) => p.project.projectId)).toEqual(['a', 'b'])
    expect(views.projects[0]!.threads.map((t) => t.threadId)).toEqual([
      'review',
      'live',
    ])
    expect(views.projects[1]!.threads.map((t) => t.threadId)).toEqual([
      'review',
    ])
    expect(views.attention.map((t) => t.threadId)).toEqual(['review'])
    expect(views.running.map((t) => t.threadId)).toEqual(['live'])
  })

  test('no live membership is Chats (unsorted) and the inbox is not a project', () => {
    const views = organizedViews(organization)
    expect(views.unsorted.map((t) => t.threadId)).toEqual([
      'snoozed',
      'terminal',
    ])
    expect(views.later.map((t) => t.threadId)).toEqual(['snoozed'])
    expect(views.projects.some((p) => p.project.isInbox)).toBe(false)
  })

  test('threads kept apart stay out of every view', () => {
    const views = organizedViews(organization, new Set(['terminal']))
    expect(views.unsorted.map((t) => t.threadId)).toEqual(['snoozed'])
    expect(views.byId.has('terminal')).toBe(false)
  })

  test('a changing badge does not reorder the tree', () => {
    const before = organizedViews(organization).projects[0]!.threads.map(
      (t) => t.threadId,
    )
    const after = organizedViews({
      ...organization,
      threads: organization.threads.map((t) =>
        t.threadId === 'live'
          ? {
              ...t,
              attention: {
                reasons: [{ kind: 'failed' as const, runId: 'run', atMs: 3 }],
                running: false,
              },
            }
          : t,
      ),
    }).projects[0]!.threads.map((t) => t.threadId)
    expect(after).toEqual(before)
  })
})

describe('sessionLists', () => {
  const lists = sessionLists(
    organizedViews({
      projects: [
        project('inbox', { isInbox: true }),
        project('todo'),
        project('player'),
        project('release', { createdBy: 'librarian' }),
      ],
      threads: [
        thread('checklist', {
          memberships: [member('todo')],
          lastMessageAtMs: 50,
        }),
        thread('both', {
          memberships: [
            member('player', { atMs: 2 }),
            member('todo', { pinned: true, atMs: 3 }),
          ],
        }),
        thread('notes', {
          memberships: [member('release'), member('player', { atMs: 4 })],
        }),
        thread('drafted', {
          memberships: [member('release')],
          createdAtMs: 30,
        }),
        thread('loose', { lastMessageAtMs: 40 }),
        thread('quiz', {
          lastMessageAtMs: 20,
          attention: {
            reasons: [
              {
                kind: 'review',
                reviewId: 'r',
                title: 'Pick one',
                optionCount: 2,
                atMs: 20,
              },
            ],
            running: false,
          },
        }),
        thread('migrate', {
          memberships: [member('todo')],
          lastMessageAtMs: 60,
          attention: {
            reasons: [
              {
                kind: 'approval',
                runId: 'run',
                approvalId: 'a',
                toolName: 'shell',
                atMs: 60,
              },
            ],
            running: false,
          },
        }),
        thread('flaky', {
          lastMessageAtMs: 10,
          attention: {
            reasons: [{ kind: 'failed', runId: 'run', atMs: 10 }],
            running: false,
          },
        }),
      ],
    }),
  )
  const ids = (threads: readonly ThreadEntry[]) =>
    threads.map((t) => t.threadId)

  test('sections are the projects the user made', () => {
    expect(lists.sections.map((s) => s.project.projectId)).toEqual([
      'todo',
      'player',
    ])
  })

  test('Recent is every session in no such section, newest first', () => {
    expect(ids(lists.recent)).toEqual(['loose', 'drafted', 'quiz', 'flaky'])
  })

  test('a session sits in its primary section, else its first one the user made', () => {
    expect(lists.home.get('both')).toBe('todo')
    expect(lists.home.get('notes')).toBe('player')
    expect(lists.home.get('drafted')).toBe('recent')
  })

  test('Review is what waits on a review or an approval, not a failure', () => {
    expect(ids(lists.review)).toEqual(['migrate', 'quiz'])
  })
})

describe('primaryProjectId', () => {
  test('a pinned placement outranks an older Librarian one', () => {
    expect(
      primaryProjectId(
        thread('t', {
          memberships: [
            member('old', { atMs: 1 }),
            member('mine', { atMs: 5, pinned: true }),
          ],
        }),
      ),
    ).toBe('mine')
  })

  test('no membership falls back to home', () => {
    expect(primaryProjectId(thread('t', { homeProjectId: 'home' }))).toBe(
      'home',
    )
  })
})

describe('nestByOrigin', () => {
  test('a fork sits under a source in the same list and stands alone otherwise', () => {
    const fork = thread('fork', {
      origin: {
        kind: 'forked',
        threadId: 'source',
        branchId: 'b',
        messageId: 'm',
      },
    })
    const orphan = thread('orphan', {
      origin: { kind: 'continued', threadId: 'elsewhere' },
    })
    const { roots, children } = nestByOrigin([thread('source'), fork, orphan])
    expect(roots.map((t) => t.threadId)).toEqual(['source', 'orphan'])
    expect(children.get('source')?.map((t) => t.threadId)).toEqual(['fork'])
  })
})

describe('rootOf', () => {
  test('follows a nested thread up to the root it shows under', () => {
    const threads = [
      thread('root'),
      thread('fork', {
        origin: {
          kind: 'forked',
          threadId: 'root',
          branchId: 'b',
          messageId: 'm',
        },
      }),
      thread('deep', { origin: { kind: 'continued', threadId: 'fork' } }),
      thread('orphan', {
        origin: { kind: 'continued', threadId: 'elsewhere' },
      }),
    ]
    expect(rootOf(threads, 'deep')).toBe('root')
    expect(rootOf(threads, 'orphan')).toBe('orphan')
    expect(rootOf(threads, 'root')).toBe('root')
  })
})

describe('applyPlacement', () => {
  test('adding pins, removing drops, and pins move without losing the reason', () => {
    const next = applyPlacement(
      [member('a'), member('b')],
      { add: ['c'], remove: ['b'], pin: ['a'], why: 'mine' },
      7,
    )
    expect(next.map((m) => [m.projectId, m.pinned])).toEqual([
      ['a', true],
      ['c', true],
    ])
    expect(next[0]!.why).toBe('about this')
    expect(next[1]).toMatchObject({ by: 'user', why: 'mine', atMs: 7 })
  })
})

describe('organizationFromThreads', () => {
  const apiProject = (projectId: string, createdAtMs: number) =>
    ({
      projectId,
      title: projectId,
      instructions: '',
      status: 'regular',
      createdAtMs,
    }) as Theorem.Project
  const apiThread = (
    threadId: string,
    projectId: string,
    over: Partial<Theorem.Thread> = {},
  ) =>
    ({
      threadId,
      projectId,
      title: threadId,
      status: 'regular',
      activeRunId: null,
      revision: 1,
      createdAtMs: 1,
      updatedAtMs: 1,
      ...over,
    }) as Theorem.Thread

  test('the oldest project is the inbox and its threads are Chats (unsorted)', () => {
    const read = organizationFromThreads(
      [apiProject('later', 5), apiProject('first', 1)],
      [apiThread('here', 'first'), apiThread('there', 'later')],
    )
    expect(read.served).toBe(false)
    expect(read.projects.find((p) => p.isInbox)?.projectId).toBe('first')
    const views = organizedViews(read)
    expect(views.unsorted.map((t) => t.threadId)).toEqual(['here'])
    expect(views.projects[0]!.threads.map((t) => t.threadId)).toEqual(['there'])
  })

  test('run state and failures are read from the thread', () => {
    const read = organizationFromThreads(
      [apiProject('p', 1)],
      [
        apiThread('live', 'p', { activeRunId: 'run' }),
        apiThread('bad', 'p', {
          lastRun: { outcome: 'failed', runId: 'r', endedAtMs: 3 },
        }),
      ],
    )
    const views = organizedViews(read)
    expect(views.running.map((t) => t.threadId)).toEqual(['live'])
    expect(views.attention.map((t) => t.threadId)).toEqual(['bad'])
  })
})

describe('planMove', () => {
  const unserved = organizationFromThreads(
    ['inbox', 'a', 'b'].map(
      (projectId, index) =>
        ({
          projectId,
          title: projectId,
          instructions: '',
          status: 'regular',
          createdAtMs: index,
        }) as Theorem.Project,
    ),
    [],
  )
  const served = { ...unserved, served: true }

  test('served: a drag from one project to another leaves the first and joins the second', () => {
    const t = thread('t', { memberships: [member('a'), member('c')] })
    expect(planMove(served, t, 'a', 'b')).toEqual({
      kind: 'placement',
      change: { add: ['b'], remove: ['a'] },
    })
  })

  test('served: a drag from an attention view only adds, and a member is left alone', () => {
    const t = thread('t', { memberships: [member('a')] })
    expect(planMove(served, t, 'view:running', 'b')).toEqual({
      kind: 'placement',
      change: { add: ['b'], remove: [] },
    })
    expect(planMove(served, t, 'view:running', 'a')).toBeUndefined()
  })

  test('served: Chats (unsorted) drops every membership, and an unsorted thread needs nothing', () => {
    const t = thread('t', { memberships: [member('a'), member('b')] })
    expect(planMove(served, t, 'a', null)).toEqual({
      kind: 'placement',
      change: { remove: ['a', 'b'] },
    })
    expect(planMove(served, thread('u'), 'unsorted', null)).toBeUndefined()
  })

  test('unserved: a move changes home, and Chats (unsorted) is the inbox', () => {
    const t = thread('t', { homeProjectId: 'a' })
    expect(planMove(unserved, t, 'a', 'b')).toEqual({
      kind: 'home',
      projectId: 'b',
    })
    expect(planMove(unserved, t, 'a', null)).toEqual({
      kind: 'home',
      projectId: 'inbox',
    })
    expect(planMove(unserved, t, 'a', 'a')).toBeUndefined()
  })
})

describe('rehome', () => {
  test('a filed home is one implicit membership and the inbox is none', () => {
    const t = thread('t', { homeProjectId: 'a', createdAtMs: 4 })
    expect(rehome(t, 'b', 'inbox')).toMatchObject({
      homeProjectId: 'b',
      memberships: [{ projectId: 'b', by: 'user', implicit: true, atMs: 4 }],
    })
    expect(rehome(t, 'inbox', 'inbox').memberships).toEqual([])
  })
})
