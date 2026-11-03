// SOURCING: Base UI's Tabs (a tab per view), React's lazy and Suspense (the
// calendar's code loads with the first calendar), FullCalendar through
// query-calendar.tsx. A query's views as Bases shows them: a table with its
// groups and summaries, a list, a calendar.
import { Tabs } from '@base-ui/react/tabs'
import { Suspense, lazy } from 'react'
import type { QueryResult, QueryRow, QueryViewResult } from '@/lib/blocks/query'
import { BlockMessage } from './block-status'
import { cellText } from './query-cells'

const QueryCalendar = lazy(() => import('./query-calendar'))

function Rows({
  view,
  rows,
}: {
  view: QueryViewResult
  rows: Array<QueryRow>
}) {
  return rows.map((row, index) => (
    <tr key={index} className="border-t border-separator">
      {view.columns.map((column) => (
        <td key={column.key} className="px-2 py-1 align-top">
          {cellText(row[column.key])}
        </td>
      ))}
    </tr>
  ))
}

function QueryTable({ view }: { view: QueryViewResult }) {
  const summaries = Object.keys(view.summaries).length > 0
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr>
            {view.columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className="px-2 py-1 font-medium text-ink-muted"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        {view.groups ? (
          view.groups.map((group, index) => (
            <tbody key={index}>
              <tr className="border-t border-separator">
                <th
                  colSpan={view.columns.length}
                  scope="rowgroup"
                  className="px-2 pt-2 pb-1 font-medium text-ink"
                >
                  {cellText(group.value) || 'None'}
                  <span className="ms-1.5 font-normal text-ink-faint">
                    {group.rows.length}
                  </span>
                </th>
              </tr>
              <Rows view={view} rows={group.rows} />
            </tbody>
          ))
        ) : (
          <tbody>
            <Rows view={view} rows={view.rows} />
          </tbody>
        )}
        {summaries && (
          <tfoot>
            <tr className="border-t border-separator text-ink-muted">
              {view.columns.map((column) => (
                <td key={column.key} className="px-2 py-1">
                  {column.key in view.summaries
                    ? cellText(view.summaries[column.key])
                    : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function QueryList({ view }: { view: QueryViewResult }) {
  const [first, ...rest] = view.columns
  return (
    <ul className="space-y-1 px-2 text-xs">
      {view.rows.map((row, index) => (
        <li key={index}>
          <span className="text-ink">
            {first ? cellText(row[first.key]) : ''}
          </span>
          {rest.map((column) => {
            const text = cellText(row[column.key])
            return text ? (
              <span key={column.key} className="ms-2 text-ink-faint">
                {column.label}: {text}
              </span>
            ) : null
          })}
        </li>
      ))}
    </ul>
  )
}

function View({ view }: { view: QueryViewResult }) {
  const body =
    view.type === 'calendar' ? (
      <Suspense fallback={<BlockMessage>Loading the calendar…</BlockMessage>}>
        <QueryCalendar view={view} />
      </Suspense>
    ) : view.type === 'list' ? (
      <QueryList view={view} />
    ) : (
      <QueryTable view={view} />
    )
  return (
    <>
      {body}
      {view.total > view.rows.length && (
        <BlockMessage>
          Showing {view.rows.length} of {view.total}.
        </BlockMessage>
      )}
    </>
  )
}

/** A query block's result: its one view, or a tab per view. */
export function QueryView({ result }: { result: QueryResult }) {
  const [only] = result.views
  return (
    <div className="space-y-1.5 py-1.5">
      {result.views.length === 1 && only ? (
        <View view={only} />
      ) : (
        <Tabs.Root defaultValue={0}>
          <Tabs.List className="flex gap-1 px-2">
            {result.views.map((view, index) => (
              <Tabs.Tab
                key={index}
                value={index}
                className="rounded-md px-2 py-0.5 text-xs text-ink-muted hover:bg-hover data-active:bg-selected data-active:text-ink"
              >
                {view.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {result.views.map((view, index) => (
            <Tabs.Panel key={index} value={index} className="pt-1.5">
              <View view={view} />
            </Tabs.Panel>
          ))}
        </Tabs.Root>
      )}
      {result.errors.length > 0 && (
        <BlockMessage tone="error">{result.errors.join('\n')}</BlockMessage>
      )}
    </div>
  )
}
