// SOURCING: bun:test over the work tracker's cache edits and mutation hooks, rendered with React into happy-dom (test/workspace's render, which supplies the QueryClient) against a fake WorkSource
import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, test } from 'bun:test'
import { act } from 'react'
import { cleanup, render, settle, waitFor } from '../../../test/workspace'
import {
  SETTINGS_KEY,
  applyInboxAction,
  applyPatch,
  applyWorkEvent,
  inboxStateIncludes,
  workKeys,
} from './cache'
import type { InboxPages, ItemPages } from './cache'
import type { InboxEntry, WorkItem, WorkItemDetail, WorkItemPatch } from './contract'
import { DOING, FACETS, SETTINGS, TODO, entry, fakeSource, item, project } from './fixtures'
import { holdWorkEvents } from './events'
import { useInboxAction, usePatchWorkItem } from './queries'
import { WorkSourceProvider } from './source'
import type { WorkSignal, WorkSource } from './source'

afterEach(cleanup)

const keys = workKeys('fake')
const QUERY = { groupBy: 'status' } as const

const pages = (...list: WorkItem[]): ItemPages => ({
  pageParams: [undefined],
  pages: [
    {
      items: list,
      total: list.length,
      groups: [
        { key: 'todo', label: 'Todo', count: list.filter((i) => i.status.id === 'todo').length },
        { key: 'doing', label: 'In Progress', count: list.filter((i) => i.status.id === 'doing').length },
      ],
    },
  ],
})

const inboxPages = (unreadCount: number, ...entries: InboxEntry[]): InboxPages => ({
  pageParams: [undefined],
  pages: [{ entries, unreadCount }],
})

const listed = (client: QueryClient) =>
  client.getQueryData<ItemPages>(keys.itemList(QUERY))!.pages[0]!

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('applyPatch', () => {
  const base = item('1', { assignees: [FACETS.assignees[0]!], projectId: 'p1', dueAt: '2026-12-01' })

  test('resolves ids through the item first, then the facets', () => {
    const next = applyPatch(
      base,
      { statusId: 'doing', assignees: ['ada', 'lin'], labels: ['bug'], priority: 1, title: 'New' },
      FACETS,
    )
    expect(next.status).toEqual(DOING)
    expect(next.assignees.map((a) => a.id)).toEqual(['ada', 'lin'])
    expect(next.labels.map((l) => l.name)).toEqual(['bug'])
    expect(next.priority).toBe(1)
    expect(next.title).toBe('New')
  })

  test('null clears project, milestone and due date', () => {
    const next = applyPatch(base, { projectId: null, milestoneId: null, dueAt: null })
    expect(next.projectId).toBeUndefined()
    expect(next.dueAt).toBeUndefined()
  })

  test('a status the facets do not know leaves the status alone', () => {
    expect(applyPatch(base, { statusId: 'nope' }, FACETS).status).toEqual(TODO)
  })
})

describe('inbox states', () => {
  const at = '2026-11-05T00:00:00Z'

  test('snoozed entries leave unread and all until they are due', () => {
    const snoozed = entry('e', { snoozedUntil: '2026-11-06T00:00:00Z' })
    expect(inboxStateIncludes('snoozed', snoozed, at)).toBe(true)
    expect(inboxStateIncludes('all', snoozed, at)).toBe(false)
    expect(inboxStateIncludes('unread', snoozed, at)).toBe(false)
    const due = entry('e', { snoozedUntil: '2026-11-04T00:00:00Z' })
    expect(inboxStateIncludes('all', due, at)).toBe(true)
    expect(inboxStateIncludes('snoozed', due, at)).toBe(false)
  })

  test('archived entries are only in archived; read ones are not unread', () => {
    const archived = entry('e', { archivedAt: at })
    expect(inboxStateIncludes('archived', archived, at)).toBe(true)
    expect(inboxStateIncludes('all', archived, at)).toBe(false)
    const read = entry('e', { readAt: at })
    expect(inboxStateIncludes('unread', read, at)).toBe(false)
    expect(inboxStateIncludes('all', read, at)).toBe(true)
  })

  test('actions change the entry', () => {
    const e = entry('e')
    expect(applyInboxAction(e, 'read', undefined, at).readAt).toBe(at)
    expect(applyInboxAction({ ...e, readAt: at }, 'unread').readAt).toBeUndefined()
    expect(applyInboxAction(e, 'snooze', '2026-12-01').snoozedUntil).toBe('2026-12-01')
    expect(applyInboxAction(e, 'archive', undefined, at).archivedAt).toBe(at)
    const back = applyInboxAction({ ...e, archivedAt: at, snoozedUntil: '2027-01-01' }, 'unarchive')
    expect(back.archivedAt).toBeUndefined()
    expect(back.snoozedUntil).toBeUndefined()
  })
})

describe('an edit shown before the server answers', () => {
  async function setup(source: Partial<WorkSource>) {
    const seen: Array<{
      client: QueryClient
      patch: ReturnType<typeof usePatchWorkItem>
    }> = []
    function Probe() {
      seen.push({ client: useQueryClient(), patch: usePatchWorkItem() })
      return null
    }
    const { queryClient } = await render(
      <WorkSourceProvider source={fakeSource(source)}>
        <Probe />
      </WorkSourceProvider>,
    )
    const one = item('1', { status: TODO })
    queryClient.setQueryData(keys.facets, FACETS)
    queryClient.setQueryData(keys.itemList(QUERY), pages(one, item('2')))
    queryClient.setQueryData<WorkItemDetail>(keys.item('1'), { item: one, timeline: [] })
    const mutate = (id: string, patch: WorkItemPatch) =>
      act(async () => {
        seen.at(-1)!.patch.mutate({ id, patch })
      })
    return { client: queryClient, mutate }
  }

  test('the list and the detail change at once, then take the server answer', async () => {
    const answer = deferred<WorkItem>()
    const sent: Array<[string, WorkItemPatch, string]> = []
    const { client, mutate } = await setup({
      patchItem: (id, patch, revision) => {
        sent.push([id, patch, revision])
        return answer.promise
      },
    })

    await mutate('1', { statusId: 'doing' })
    await settle()
    expect(listed(client).items[0]!.status.id).toBe('doing')
    expect(client.getQueryData<WorkItemDetail>(keys.item('1'))!.item.status.id).toBe('doing')
    // The group counts follow the card.
    expect(listed(client).groups!.map((g) => g.count)).toEqual([1, 1])
    expect(sent).toEqual([['1', { statusId: 'doing' }, 'r1']])

    await act(async () => answer.resolve(item('1', { status: DOING, revision: 'r2', title: 'From server' })))
    await settle()
    expect(listed(client).items[0]!.title).toBe('From server')
    expect(listed(client).items[0]!.revision).toBe('r2')
  })

  test('a refusal puts the item back as it was', async () => {
    const answer = deferred<WorkItem>()
    const { client, mutate } = await setup({ patchItem: () => answer.promise })

    await mutate('1', { statusId: 'doing', title: 'Changed' })
    await settle()
    expect(listed(client).items[0]!.title).toBe('Changed')

    await act(async () => answer.reject(new Error('conflict')))
    await settle()
    expect(listed(client).items[0]!.title).toBe('Item 1')
    expect(listed(client).items[0]!.status.id).toBe('todo')
    expect(client.getQueryData<WorkItemDetail>(keys.item('1'))!.item.status.id).toBe('todo')
    expect(listed(client).groups!.map((g) => g.count)).toEqual([2, 0])
  })

  test('quick edits go one at a time, each with the revision the last returned', async () => {
    const answers = [deferred<WorkItem>(), deferred<WorkItem>()]
    const revisions: string[] = []
    const { client, mutate } = await setup({
      patchItem: (_id, _patch, revision) => {
        revisions.push(revision)
        return answers[revisions.length - 1]!.promise
      },
    })

    await mutate('1', { priority: 1 })
    await mutate('1', { priority: 2 })
    await settle()
    // The second waits for the first, so only one request is out.
    expect(revisions).toEqual(['r1'])

    await act(async () => answers[0]!.resolve(item('1', { priority: 1, revision: 'r2' })))
    await waitFor(() => revisions.length === 2)
    expect(revisions).toEqual(['r1', 'r2'])

    await act(async () => answers[1]!.resolve(item('1', { priority: 2, revision: 'r3' })))
    await settle()
    expect(listed(client).items[0]!.priority).toBe(2)
  })
})

describe('inbox actions', () => {
  test('reading an entry shows it read and lowers the unread count; a refusal undoes both', async () => {
    const answer = deferred<InboxEntry>()
    const seen: Array<ReturnType<typeof useInboxAction>> = []
    function Probe() {
      seen.push(useInboxAction())
      return null
    }
    const unread = entry('e1')
    const { queryClient: client } = await render(
      <WorkSourceProvider source={fakeSource({ actOnInbox: () => answer.promise })}>
        <Probe />
      </WorkSourceProvider>,
    )
    client.setQueryData(keys.inboxList('unread'), inboxPages(3, unread, entry('e2')))
    client.setQueryData(keys.inboxList('all'), inboxPages(3, unread, entry('e2')))

    await act(async () => seen.at(-1)!.mutate({ entry: unread, action: 'read' }))
    await settle()
    const unreadList = client.getQueryData<InboxPages>(keys.inboxList('unread'))!.pages[0]!
    expect(unreadList.entries.map((e) => e.id)).toEqual(['e2'])
    expect(unreadList.unreadCount).toBe(2)
    const allList = client.getQueryData<InboxPages>(keys.inboxList('all'))!.pages[0]!
    expect(allList.entries[0]!.readAt).toBeDefined()
    expect(allList.unreadCount).toBe(2)

    await act(async () => answer.reject(new Error('offline')))
    await settle()
    const undone = client.getQueryData<InboxPages>(keys.inboxList('all'))!.pages[0]!
    expect(undone.entries[0]!.readAt).toBeUndefined()
    expect(undone.unreadCount).toBe(3)
  })
})

describe('live events', () => {
  const stale = (client: QueryClient, key: readonly unknown[]) =>
    client.getQueryState(key)?.isInvalidated

  function seeded() {
    const client = new QueryClient()
    client.setQueryData(keys.itemList(QUERY), pages(item('1'), item('2')))
    client.setQueryData<WorkItemDetail>(keys.item('1'), { item: item('1'), timeline: [] })
    return client
  }

  test('a changed item is replaced in place, with its group counts, and the lists marked stale', () => {
    const client = seeded()
    applyWorkEvent(client, 'fake', {
      type: 'work.item.upserted',
      item: item('1', { status: DOING, title: 'Moved', revision: 'r9' }),
    })
    const page = listed(client)
    expect(page.items.map((i) => i.id)).toEqual(['1', '2'])
    expect(page.items[0]!.title).toBe('Moved')
    expect(page.groups!.map((g) => g.count)).toEqual([1, 1])
    expect(client.getQueryData<WorkItemDetail>(keys.item('1'))!.item.revision).toBe('r9')
    expect(stale(client, keys.itemList(QUERY))).toBe(true)
  })

  test('an item no list holds is not guessed into one; the lists read again', () => {
    const client = seeded()
    applyWorkEvent(client, 'fake', { type: 'work.item.upserted', item: item('99') })
    expect(listed(client).items.map((i) => i.id)).toEqual(['1', '2'])
    expect(stale(client, keys.itemList(QUERY))).toBe(true)
  })

  test('a deleted item leaves every list and its detail', () => {
    const client = seeded()
    applyWorkEvent(client, 'fake', { type: 'work.item.deleted', id: '1' })
    expect(listed(client).items.map((i) => i.id)).toEqual(['2'])
    expect(listed(client).total).toBe(1)
    expect(client.getQueryData(keys.item('1'))).toBeUndefined()
  })

  test('an inbox entry lands in the lists it fits and leaves the others, with the unread count', () => {
    const client = seeded()
    const old = entry('e1')
    client.setQueryData(keys.inboxList('unread'), inboxPages(1, old))
    client.setQueryData(keys.inboxList('archived'), inboxPages(0))
    client.setQueryData(keys.inboxList('all'), inboxPages(1, old))

    applyWorkEvent(client, 'fake', {
      type: 'work.inbox.upserted',
      entry: entry('e2'),
      unreadCount: 2,
    })
    const ids = (state: 'unread' | 'archived' | 'all') =>
      client.getQueryData<InboxPages>(keys.inboxList(state))!.pages[0]!.entries.map((e) => e.id)
    expect(ids('unread')).toEqual(['e2', 'e1'])
    expect(ids('all')).toEqual(['e2', 'e1'])
    expect(ids('archived')).toEqual([])
    expect(client.getQueryData<InboxPages>(keys.inboxList('unread'))!.pages[0]!.unreadCount).toBe(2)

    applyWorkEvent(client, 'fake', {
      type: 'work.inbox.upserted',
      entry: { ...old, archivedAt: '2026-11-03T00:00:00Z' },
      unreadCount: 1,
    })
    expect(ids('unread')).toEqual(['e2'])
    expect(ids('archived')).toEqual(['e1'])
  })

  test('a project and the sync state replace what is held', () => {
    const client = seeded()
    client.setQueryData(keys.projects, [project('a'), project('b')])
    client.setQueryData(SETTINGS_KEY, SETTINGS)
    applyWorkEvent(client, 'fake', {
      type: 'work.project.upserted',
      project: { ...project('b'), name: 'Renamed' },
    })
    expect(client.getQueryData<ReturnType<typeof project>[]>(keys.projects)!.map((p) => p.name)).toEqual([
      'Project a',
      'Renamed',
    ])
    applyWorkEvent(client, 'fake', { type: 'work.sync', sync: { state: 'running' } })
    expect(client.getQueryData<typeof SETTINGS>(SETTINGS_KEY)!.sync.state).toBe('running')
  })

  test('a resync marks everything stale', () => {
    const client = seeded()
    applyWorkEvent(client, 'fake', { type: 'work.resync' })
    expect(stale(client, keys.itemList(QUERY))).toBe(true)
  })

  test('rows of another source are untouched', () => {
    const client = seeded()
    const other = workKeys('other').itemList(QUERY)
    client.setQueryData(other, pages(item('1')))
    applyWorkEvent(client, 'fake', { type: 'work.item.deleted', id: '1' })
    expect(client.getQueryData<ItemPages>(other)!.pages[0]!.items).toHaveLength(1)
  })
})

describe('one subscription however many ask', () => {
  test('opened once, closed when the last holder lets go, and its events reach the cache', () => {
    const client = new QueryClient()
    let opened = 0
    let closed = 0
    let send!: (signal: WorkSignal) => void
    const source = fakeSource({
      subscribe: (listener) => {
        opened++
        send = listener
        return () => void closed++
      },
    })
    client.setQueryData(keys.itemList(QUERY), pages(item('1'), item('2')))

    const releaseA = holdWorkEvents(client, source)
    const releaseB = holdWorkEvents(client, source)
    expect(opened).toBe(1)

    send({ type: 'work.item.deleted', id: '1' })
    expect(listed(client).items.map((i) => i.id)).toEqual(['2'])

    releaseA()
    expect(closed).toBe(0)
    releaseB()
    expect(closed).toBe(1)

    holdWorkEvents(client, source)()
    expect(opened).toBe(2)
  })
})
