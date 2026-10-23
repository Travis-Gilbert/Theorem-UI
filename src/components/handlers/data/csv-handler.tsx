// SOURCING: papaparse (CSV and TSV, the delimiter detected), TanStack Table
// v9 (columns and sorting) and TanStack Virtual (only the rows in view are
// drawn), following Table's virtualized-rows example. The first row names
// the columns, as spreadsheets read it.
import {
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import Papa from 'papaparse'
import { useMemo, useRef } from 'react'
import { useTextFile } from '@/lib/handlers/file-sync'
import type { FileCardProps, FileViewProps } from '@/lib/handlers/types'
import { cn } from '@/lib/utils'
import { FileMessage, textFileMessage } from '../file-status'

type Row = Array<string>

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
})

/** The file's rows, the first naming the columns. */
export function parseDelimited(text: string) {
  const parsed = Papa.parse<Row>(text, { skipEmptyLines: 'greedy' })
  const [header = [], ...rows] = parsed.data
  const width = Math.max(header.length, ...rows.map((r) => r.length))
  const names = Array.from(
    { length: width },
    (_, i) => header[i]?.trim() || `Column ${i + 1}`,
  )
  // Papa Parse can report more than one error for a row, and reports a file
  // whose delimiter it guessed (one column, say) with no row at all.
  const unreadable = new Set(
    parsed.errors.flatMap((error) =>
      error.row === undefined ? [] : error.row,
    ),
  ).size
  return { names, rows, unreadable }
}

const ROW_HEIGHT = 30

function Table({ names, rows }: { names: Array<string>; rows: Array<Row> }) {
  const columns = useMemo(
    () =>
      names.map((name, i): ColumnDef<typeof features, Row> => ({
        id: String(i),
        header: name,
        accessorFn: (row) => row[i] ?? '',
        sortFn: 'alphanumeric',
      })),
    [names],
  )
  const table = useTable({ features, columns, data: rows })
  const scroller = useRef<HTMLDivElement>(null)
  const shown = table.getRowModel().rows
  const virtualizer = useVirtualizer({
    count: shown.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => shown[index]?.id ?? index,
    overscan: 10,
  })

  return (
    <div ref={scroller} className="h-full overflow-auto">
      <table className="grid w-max min-w-full text-sm">
        <thead className="sticky top-0 z-10 grid bg-raised">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="flex border-b border-separator">
              <th className="w-14 shrink-0" aria-label="Row" />
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    aria-sort={
                      sorted === 'asc'
                        ? 'ascending'
                        : sorted === 'desc'
                          ? 'descending'
                          : undefined
                    }
                    className="w-48 shrink-0 text-start font-medium"
                  >
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="flex w-full items-center gap-1 truncate px-2 py-1.5 text-start hover:bg-hover"
                    >
                      <span className="truncate">
                        <table.FlexRender header={header} />
                      </span>
                      {sorted && (
                        <span aria-hidden className="text-ink-faint">
                          {sorted === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </button>
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody
          className="relative grid"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = shown[item.index]
            if (!row) return null
            return (
              <tr
                key={row.id}
                data-index={item.index}
                className="absolute flex w-full border-b border-separator/60"
                style={{
                  transform: `translateY(${item.start}px)`,
                  height: ROW_HEIGHT,
                }}
              >
                <td className="w-14 shrink-0 px-2 py-1 text-end text-xs text-ink-faint tabular-nums">
                  {row.index + 1}
                </td>
                {row.getAllCells().map((cell) => (
                  <td
                    key={cell.id}
                    title={String(cell.getValue())}
                    className="w-48 shrink-0 truncate px-2 py-1"
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function CsvPanel(file: FileViewProps) {
  const text = useTextFile(file)
  const data = useMemo(
    () => (text.text === undefined ? undefined : parseDelimited(text.text)),
    [text.text],
  )
  const message = textFileMessage(text)
  if (message !== null || !data) return <FileMessage>{message}</FileMessage>
  if (!data.names.length)
    return <FileMessage>This file has no rows.</FileMessage>
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-3 border-b border-separator px-3 text-xs text-ink-faint">
        <span>
          {data.rows.length} {data.rows.length === 1 ? 'row' : 'rows'},{' '}
          {data.names.length} {data.names.length === 1 ? 'column' : 'columns'}
        </span>
        {data.unreadable > 0 && (
          <span className="text-error-ink">
            {data.unreadable} {data.unreadable === 1 ? 'line' : 'lines'} could
            not be read
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <Table names={data.names} rows={data.rows} />
      </div>
    </div>
  )
}

const CARD_ROWS = 8

/** The first rows, as a small table. */
export function CsvCard({ client, path, zoom }: FileCardProps) {
  const text = useTextFile({ client, path })
  const data = useMemo(
    () => (text.text === undefined ? undefined : parseDelimited(text.text)),
    [text.text],
  )
  const message = textFileMessage(text)
  if (message !== null || !data)
    return <FileMessage className="text-xs">{message}</FileMessage>
  return (
    <div
      className={cn(
        'h-full overflow-hidden bg-raised',
        zoom < 0.4 && 'text-[10px]',
      )}
    >
      <table className="w-full table-fixed text-xs">
        <thead>
          <tr className="border-b border-separator">
            {data.names.map((name, i) => (
              <th key={i} className="truncate px-2 py-1 text-start font-medium">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.slice(0, CARD_ROWS).map((row, r) => (
            <tr key={r} className="border-b border-separator/60">
              {data.names.map((_, i) => (
                <td key={i} className="truncate px-2 py-1 text-ink-muted">
                  {row[i]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
