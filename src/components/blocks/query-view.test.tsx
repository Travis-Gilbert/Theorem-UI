// SOURCING: bun:test over the query views, rendered with React into happy-dom
// (test/blocks/render.tsx); Base UI's tabs are clicked as a person would.
import { afterEach, expect, test } from 'bun:test'
import type { QueryResult, QueryViewResult } from '@/lib/blocks/query'
import { cleanup, click, render, waitFor } from '../../../test/blocks/render'
import { QueryView } from './query-view'

afterEach(cleanup)

const columns = [
  { key: 'habit', label: 'Habit' },
  { key: 'date', label: 'Date' },
  { key: 'done', label: 'Done' },
]
const rows = [
  { habit: 'run', date: new Date('2026-10-20T00:00:00Z'), done: true },
  { habit: 'read', date: new Date('2026-10-21T00:00:00Z'), done: false },
  { habit: 'run', date: new Date('2026-10-22T00:00:00Z'), done: true },
]

const view = (patch: Partial<QueryViewResult>): QueryViewResult => ({
  type: 'table',
  name: 'Table',
  columns,
  rows,
  groups: null,
  summaries: {},
  dateKey: null,
  total: rows.length,
  ...patch,
})

const result = (...views: Array<QueryViewResult>): QueryResult => ({
  views,
  rows: views[0]?.rows ?? [],
  errors: [],
})

test('a table shows its groups, its summaries and a day as a day', async () => {
  const { container } = await render(
    <QueryView
      result={result(
        view({
          groups: [
            { value: 'run', rows: [rows[0]!, rows[2]!] },
            { value: 'read', rows: [rows[1]!] },
          ],
          summaries: { done: 2 },
        }),
      )}
    />,
  )
  const headers = [...container.querySelectorAll('th[scope="col"]')]
  expect(headers.map((th) => th.textContent)).toEqual(['Habit', 'Date', 'Done'])
  const groups = [...container.querySelectorAll('th[scope="rowgroup"]')]
  expect(groups.map((th) => th.textContent)).toEqual(['run2', 'read1'])
  expect(container.querySelector('tbody td')?.nextElementSibling?.textContent).toBe(
    '2026-10-20',
  )
  expect(container.querySelector('tfoot')?.textContent).toBe('2')
})

test('a limited view says how many rows it left out', async () => {
  const { container } = await render(
    <QueryView result={result(view({ rows: rows.slice(0, 1), total: 3 }))} />,
  )
  expect(container.textContent).toContain('Showing 1 of 3.')
})

test('several views get a tab each, and a calendar places rows on their days', async () => {
  const { container } = await render(
    <QueryView
      result={result(
        view({ name: 'All' }),
        view({ type: 'list', name: 'List' }),
        view({ type: 'calendar', name: 'Calendar', dateKey: 'date' }),
      )}
    />,
  )
  const tabs = [...container.querySelectorAll('[role="tab"]')]
  expect(tabs.map((tab) => tab.textContent)).toEqual(['All', 'List', 'Calendar'])
  expect(container.querySelector('table')).not.toBeNull()

  await click(tabs[1]!)
  expect(container.querySelector('ul li')?.textContent).toContain('run')

  await click(tabs[2]!)
  const event = await waitFor(() =>
    container.querySelector('[data-date="2026-10-21"] .fc-event-title'),
  )
  expect(event.textContent).toBe('read')
  expect(container.querySelector('.fc-toolbar-title')?.textContent).toBe(
    'October 2026',
  )
})

test('expressions that failed are shown', async () => {
  const { container } = await render(
    <QueryView
      result={{ ...result(view({})), errors: ['formula streak: x is not defined'] }}
    />,
  )
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'formula streak: x is not defined',
  )
})
