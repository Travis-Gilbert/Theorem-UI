// SOURCING: bun:test over the work list and board as one screen, rendered with React into happy-dom (test/workspace's render, which supplies the QueryClient) against a fake WorkSource that filters, groups and records what it was asked
import { afterEach, describe, expect, test } from 'bun:test'
import { act } from 'react'
import { cleanup, render, waitFor } from '../../../test/workspace'
import type { WorkFilter, WorkItem, WorkQuery } from './contract'
import { DOING, DONE, FACETS, TODO, fakeSource, item, view } from './fixtures'
import { groupItems } from './grouping'
import { WorkItemsScreen } from './items-screen'
import { WorkSourceProvider } from './source'
import type { WorkSource } from './source'

afterEach(cleanup)

const ITEMS: WorkItem[] = [
  item('1', { title: 'Crash on save', status: TODO, priority: 1 }),
  item('2', { title: 'Docs for export', status: DOING, priority: 3 }),
  item('3', { title: 'Release notes', status: DONE, priority: 4 }),
]

/** A source whose items answer `status` conditions and `groupBy`, and which logs each query. */
function source(overrides: Partial<WorkSource> = {}) {
  const asked: WorkQuery[] = []
  const answers = fakeSource({
    listViews: async () => [
      view('all-issues', 'All issues', { groupBy: 'status' }),
      view('board', 'Board', { layout: 'board', groupBy: 'status' }),
    ],
    queryItems: async (query) => {
      asked.push(query)
      const wanted = (query.filter?.conditions ?? []).find(
        (c) => 'field' in c && c.field === 'status',
      )
      const items = ITEMS.filter(
        (i) => !wanted || ('value' in wanted && wanted.value === i.status.id),
      )
      return {
        items,
        total: items.length,
        groups: query.groupBy
          ? groupItems(items, query.groupBy).map(({ key, label, count }) => ({ key, label, count }))
          : undefined,
      }
    },
    createItem: async (input) => item('new', { title: input.title }),
    ...overrides,
  })
  return { source: answers, asked }
}

const text = () => document.body.textContent

describe('a board', () => {
  test('has a column for every status, empty ones too, and a card in the column of its status', async () => {
    const { source: fake } = source({
      queryItems: async (query) => ({
        items: ITEMS.slice(0, 2),
        total: 2,
        groups: groupItems(ITEMS.slice(0, 2), query.groupBy ?? 'status').map(
          ({ key, label, count }) => ({ key, label, count }),
        ),
      }),
    })
    await render(
      <WorkSourceProvider source={fake}>
        <WorkItemsScreen viewId="board" layout="board" showSync={false} />
      </WorkSourceProvider>,
    )
    await waitFor(() => text().includes('Crash on save'))

    const columns = [...document.querySelectorAll('section')]
    const headings = columns.map((c) => c.textContent)
    // Done holds nothing in this answer but is still a place to drop.
    expect(headings.some((h) => h.startsWith('Done'))).toBe(true)
    const column = (name: string) => columns.find((c) => c.textContent.startsWith(name))!
    expect(column('Todo').textContent).toContain('Crash on save')
    expect(column('In Progress').textContent).toContain('Docs for export')
    expect(column('Done').textContent).not.toContain('Release notes')
  })

  test('a card opens its item', async () => {
    const opened: string[] = []
    const { source: fake } = source()
    await render(
      <WorkSourceProvider source={fake}>
        <WorkItemsScreen
          viewId="board"
          layout="board"
          showSync={false}
          onOpen={(id) => opened.push(id)}
        />
      </WorkSourceProvider>,
    )
    const card = await waitFor(() =>
      [...document.querySelectorAll<HTMLElement>('button, [role=button], a')].find((el) =>
        el.textContent.includes('Docs for export'),
      ),
    )
    await act(async () => card.click())
    expect(opened).toEqual(['2'])
  })
})

describe('a view', () => {
  test('asks for its own filter, grouping and order, with the place\'s extra filter added on', async () => {
    const extra: WorkFilter = {
      op: 'and',
      conditions: [{ field: 'provider', operator: 'is', value: 'github' }],
    }
    const { source: fake, asked } = source()
    await render(
      <WorkSourceProvider source={fake}>
        <WorkItemsScreen viewId="all-issues" extra={extra} showSync={false} />
      </WorkSourceProvider>,
    )
    await waitFor(() => asked.length > 0)
    const query = asked[0]!
    expect(query.groupBy).toBe('status')
    expect(query.orderBy).toEqual({ field: 'updatedAt', direction: 'desc' })
    expect(JSON.stringify(query.filter)).toContain('"provider"')
    expect(query.limit).toBe(50)
  })

  test('a view that is gone says so', async () => {
    const { source: fake } = source()
    await render(
      <WorkSourceProvider source={fake}>
        <WorkItemsScreen viewId="nope" showSync={false} />
      </WorkSourceProvider>,
    )
    await waitFor(() => text().includes('This view is gone'))
  })

  test('nothing there reads as nothing there, offering a new item only when the source can make one', async () => {
    const empty = { queryItems: async () => ({ items: [], total: 0 }) }
    await render(
      <WorkSourceProvider source={source(empty).source}>
        <WorkItemsScreen viewId="all-issues" layout="board" showSync={false} />
      </WorkSourceProvider>,
    )
    await waitFor(() => /no .*(items|results|work)|nothing/i.test(text()))
    expect(text()).toMatch(/create|new/i)
  })

  test('a source that cannot create hides the control instead of failing', async () => {
    const { source: fake } = source({
      createItem: undefined,
      queryItems: async () => ({ items: [], total: 0 }),
    })
    await render(
      <WorkSourceProvider source={fake}>
        <WorkItemsScreen viewId="all-issues" layout="board" showSync={false} />
      </WorkSourceProvider>,
    )
    await waitFor(() => /no .*(items|results|work)|nothing/i.test(text()))
    const labels = [...document.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels.some((l) => /new (item|issue)|create a local item/i.test(l))).toBe(false)
  })
})

// Facets stay referenced so the fake source documents what a real one answers.
void FACETS
