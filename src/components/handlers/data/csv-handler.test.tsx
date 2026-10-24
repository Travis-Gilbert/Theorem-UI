// SOURCING: bun:test over the table handler's panel and card, rendered with
// React into happy-dom against the in-memory workspace, with layout measured
// so TanStack Virtual has a viewport to fill.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import { act } from 'react'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import { mockLayout } from '../../../../test/layout'
import {
  cleanup,
  fakeWorkspace,
  render,
  waitFor,
} from '../../../../test/workspace'
import { CsvCard, CsvPanel, parseDelimited } from './csv-handler'

const RUNS = `name,loss,epochs
beta,0.31,10
alpha,0.12,2
gamma,0.5,33
`

const entry = (path: string): WorkspaceEntry => ({
  id: `vf_${path}`,
  path,
  kind: 'file',
  size: 1,
  mtimeMs: 1,
})

let unmockLayout: () => void
beforeAll(() => {
  unmockLayout = mockLayout()
})
afterAll(() => unmockLayout())
afterEach(cleanup)

const cells = (row: Element) =>
  [...row.querySelectorAll('td')].map((td) => td.textContent)
const bodyRows = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody tr')].map(cells)

async function openPanel(path: string, text: string) {
  const ws = fakeWorkspace({ [path]: text })
  const { container } = await render(
    <CsvPanel client={ws.client} path={path} entry={entry(path)} />,
  )
  await waitFor(() => container.querySelector('tbody tr'))
  return { ws, container }
}

describe('parseDelimited', () => {
  test('the first row names the columns', () => {
    expect(parseDelimited(RUNS)).toMatchObject({
      names: ['name', 'loss', 'epochs'],
      rows: [
        ['beta', '0.31', '10'],
        ['alpha', '0.12', '2'],
        ['gamma', '0.5', '33'],
      ],
    })
  })

  test('detects tabs, and names unnamed columns', () => {
    expect(parseDelimited('a\t\n1\t2\t3\n')).toMatchObject({
      names: ['a', 'Column 2', 'Column 3'],
      rows: [['1', '2', '3']],
    })
  })
})

describe('CsvPanel', () => {
  test('shows the rows as a table', async () => {
    const { container } = await openPanel('data/runs.csv', RUNS)
    expect(container.textContent).toContain('3 rows, 3 columns')
    expect(
      [...container.querySelectorAll('thead th')].map((th) => th.textContent),
    ).toEqual(['', 'name', 'loss', 'epochs'])
    expect(bodyRows(container)).toEqual([
      ['1', 'beta', '0.31', '10'],
      ['2', 'alpha', '0.12', '2'],
      ['3', 'gamma', '0.5', '33'],
    ])
  })

  test('sorts by a column', async () => {
    const { container } = await openPanel('data/runs.csv', RUNS)
    const header = (name: string) =>
      [...container.querySelectorAll('thead th')].find((th) =>
        th.querySelector('button')?.textContent.startsWith(name),
      )
    const epochs = header('epochs')
    act(() => epochs?.querySelector('button')?.click())
    await waitFor(() => epochs?.getAttribute('aria-sort'))
    // Alphanumeric: 2 before 10 before 33.
    expect(epochs?.getAttribute('aria-sort')).toBe('ascending')
    expect(bodyRows(container).map((row) => row[3])).toEqual(['2', '10', '33'])
    // Row numbers stay with their rows.
    expect(bodyRows(container).map((row) => row[0])).toEqual(['2', '1', '3'])

    act(() => epochs?.querySelector('button')?.click())
    await waitFor(() => epochs?.getAttribute('aria-sort') === 'descending')
    expect(bodyRows(container).map((row) => row[3])).toEqual(['33', '10', '2'])
  })

  test('reads tab-separated files', async () => {
    const { container } = await openPanel(
      'data/runs.tsv',
      'name\tloss\nbeta\t0.31\n',
    )
    expect(container.textContent).toContain('1 row, 2 columns')
    expect(bodyRows(container)).toEqual([['1', 'beta', '0.31']])
  })

  test('draws only the rows in view', async () => {
    const many = [
      'n',
      ...Array.from({ length: 5000 }, (_, i) => String(i)),
    ].join('\n')
    const { container } = await openPanel('data/many.csv', many)
    expect(container.textContent).toContain('5000 rows, 1 column')
    // One column leaves the delimiter a guess, which is not an unread line.
    expect(container.textContent).not.toContain('could not be read')
    const drawn = container.querySelectorAll('tbody tr').length
    expect(drawn).toBeGreaterThan(10)
    expect(drawn).toBeLessThan(100)
  })

  test('counts the lines it could not read', async () => {
    const { container } = await openPanel(
      'data/broken.csv',
      'a,b\n1,2\n"open,3\n',
    )
    expect(container.textContent).toMatch(/1 line could not be read/)
  })

  test('an empty file has no rows', async () => {
    const ws = fakeWorkspace({ 'empty.csv': '' })
    const { container } = await render(
      <CsvPanel
        client={ws.client}
        path="empty.csv"
        entry={entry('empty.csv')}
      />,
    )
    await waitFor(() => container.textContent.includes('no rows'))
  })
})

describe('CsvCard', () => {
  test('shows the first rows', async () => {
    const text = [
      'name,value',
      ...Array.from({ length: 12 }, (_, i) => `row${i},${i}`),
    ].join('\n')
    const ws = fakeWorkspace({ 'data/runs.csv': text })
    const { container } = await render(
      <CsvCard
        client={ws.client}
        path="data/runs.csv"
        entry={entry('data/runs.csv')}
        zoom={1}
        selected={false}
      />,
    )
    await waitFor(() => container.querySelector('tbody tr'))
    expect(
      [...container.querySelectorAll('th')].map((th) => th.textContent),
    ).toEqual(['name', 'value'])
    const rows = bodyRows(container)
    expect(rows).toHaveLength(8)
    expect(rows[0]).toEqual(['row0', '0'])
    expect(rows[7]).toEqual(['row7', '7'])
  })
})
