// SOURCING: @tanstack/react-table v9 through the vendored TanStack Table kitchen-sink-shadcn-base data table (components/data-table: createTableHook, filter, sort and view lists, pagination, resizing); lib/theorem/models for the model shape and formatContext; Intl.NumberFormat for prices and counts
import * as React from 'react'
import type { Column } from '@tanstack/react-table'
import type { ExtendedColumnFilter } from '@/types/data-table'
import type { features } from '@/components/data-table/features'
import { DebouncedInput } from '@/components/data-table/debounced-input'
import {
  createAppColumnHelper,
  useAppTable,
  useCellContext,
} from '@/components/data-table/table-hook'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/data-table/ui/table'
import { Badge } from '@/components/coss/badge'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { formatContext } from '@/lib/theorem/models'
import type { ModelOption } from '@/lib/theorem/models'
import { cn } from '@/lib/utils'

/** A model as the table holds it: the option plus the person's marks on it. */
type ModelRow = ModelOption & { starred: boolean; inUse: boolean }

const ToggleStarContext = React.createContext<(ref: string) => void>(() => {})

const MODALITY_LABELS: Record<string, string> = {
  text: 'Text',
  image: 'Image',
  file: 'File',
  audio: 'Audio',
  video: 'Video',
}
const modalityLabel = (value: string) =>
  MODALITY_LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1)

const SOURCE_LABELS: Record<ModelOption['source'], string> = {
  catalog: 'Theorem catalog',
  openrouter: 'OpenRouter',
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumSignificantDigits: 3,
})

const Faint = ({ children = '–' }: { children?: React.ReactNode }) => (
  <span className="text-ink-faint">{children}</span>
)

function StarCell() {
  const cell = useCellContext<boolean>()
  const toggle = React.useContext(ToggleStarContext)
  const model = cell.row.original as ModelRow
  const starred = cell.getValue()
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-pressed={starred}
      aria-label={starred ? `Unstar ${model.name}` : `Star ${model.name}`}
      onClick={() => toggle(model.ref)}
      className={cn(starred ? 'text-redwood' : 'text-ink-faint hover:text-ink')}
    >
      <Icon.Star className={cn('size-3.5', starred && 'fill-current')} />
    </Button>
  )
}

function ModelCell() {
  const cell = useCellContext<string>()
  const model = cell.row.original as ModelRow
  return (
    <div className="flex min-w-0 flex-col gap-0.5" title={model.description}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-ink">{model.name}</span>
        {model.inUse && (
          <Badge
            size="sm"
            className="border-transparent bg-redwood-container text-redwood-ink"
          >
            In use
          </Badge>
        )}
      </div>
      <span className="truncate font-mono text-[11px] text-ink-faint">
        {model.ref}
      </span>
    </div>
  )
}

function TokensCell() {
  const value = useCellContext<number | undefined>().getValue()
  return value === undefined ? <Faint /> : <>{formatContext(value)}</>
}

function PriceCell() {
  const value = useCellContext<number | undefined>().getValue()
  if (value === undefined) return <Faint />
  return value === 0 ? (
    <span className="text-teal-ink">Free</span>
  ) : (
    <>{usd.format(value)}</>
  )
}

function InputsCell() {
  const inputs = useCellContext<readonly string[]>().getValue()
  return (
    <div className="flex gap-1 overflow-hidden">
      {inputs.map((input) => (
        <Badge
          key={input}
          size="sm"
          variant="outline"
          className="text-ink-muted"
        >
          {modalityLabel(input)}
        </Badge>
      ))}
    </div>
  )
}

function BooleanCell() {
  const value = useCellContext<boolean>().getValue()
  return value ? (
    <Icon.Check aria-label="Yes" className="size-3.5 text-teal-ink" />
  ) : (
    <Faint>
      <span aria-label="No">–</span>
    </Faint>
  )
}

function SourceCell() {
  const value = useCellContext<ModelOption['source']>().getValue()
  return <span className="text-ink-muted">{SOURCE_LABELS[value]}</span>
}

const columnHelper = createAppColumnHelper<ModelRow>()

/** Options with how many models carry each, for the filter list's facets. */
function countOptions(
  values: Iterable<string>,
  label: (value: string) => string,
) {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, count]) => ({ value, label: label(value), count }))
}

function modelColumns(models: readonly ModelOption[]) {
  const numeric = {
    sortUndefined: 'last' as const,
    enableGlobalFilter: false,
    size: 92,
  }
  return columnHelper.columns([
    columnHelper.accessor('starred', {
      id: 'starred',
      header: () => (
        <span className="flex w-full justify-center" aria-label="Starred">
          <Icon.Star className="size-3.5" />
        </span>
      ),
      cell: () => <StarCell />,
      sortFn: 'basic',
      enableHiding: false,
      enableResizing: false,
      enableGlobalFilter: false,
      size: 40,
      meta: { label: 'Starred', variant: 'boolean' },
    }),
    // Name and ref together: sorting reads the name first, and search and the
    // text filter match either.
    columnHelper.accessor((row) => `${row.name} ${row.ref}`, {
      id: 'name',
      header: ({ header }) => <header.ColumnHeader />,
      cell: () => <ModelCell />,
      sortFn: 'alphanumeric',
      enableHiding: false,
      size: 240,
      minSize: 160,
      meta: { label: 'Model', variant: 'text' },
    }),
    columnHelper.accessor('vendor', {
      id: 'vendor',
      header: ({ header }) => <header.ColumnHeader />,
      cell: ({ cell }) => <cell.TextCell />,
      size: 112,
      meta: { label: 'Vendor', variant: 'multi-select' },
    }),
    columnHelper.accessor('contextLength', {
      id: 'contextLength',
      ...numeric,
      header: ({ header }) => <header.ColumnHeader />,
      cell: () => <TokensCell />,
      meta: { label: 'Context', variant: 'number' },
    }),
    columnHelper.accessor('maxOutput', {
      id: 'maxOutput',
      ...numeric,
      header: ({ header }) => <header.ColumnHeader />,
      cell: () => <TokensCell />,
      size: 104,
      meta: { label: 'Max output', variant: 'number' },
    }),
    columnHelper.accessor('promptPrice', {
      id: 'promptPrice',
      ...numeric,
      header: ({ header }) => <header.ColumnHeader />,
      cell: () => <PriceCell />,
      meta: { label: 'Input $/M', variant: 'number' },
    }),
    columnHelper.accessor('completionPrice', {
      id: 'completionPrice',
      ...numeric,
      header: ({ header }) => <header.ColumnHeader />,
      cell: () => <PriceCell />,
      size: 100,
      meta: { label: 'Output $/M', variant: 'number' },
    }),
    columnHelper.accessor('inputs', {
      id: 'inputs',
      header: ({ header }) => <header.ColumnHeader />,
      cell: () => <InputsCell />,
      getUniqueValues: (row) => [...row.inputs],
      enableSorting: false,
      enableGlobalFilter: false,
      size: 150,
      meta: {
        label: 'Inputs',
        variant: 'multi-select',
        options: countOptions(
          models.flatMap((m) => m.inputs),
          modalityLabel,
        ),
      },
    }),
    columnHelper.accessor('tools', {
      id: 'tools',
      header: ({ header }) => <header.ColumnHeader />,
      cell: () => <BooleanCell />,
      sortFn: 'basic',
      enableGlobalFilter: false,
      size: 76,
      meta: { label: 'Tools', variant: 'boolean' },
    }),
    columnHelper.accessor('reasoning', {
      id: 'reasoning',
      header: ({ header }) => <header.ColumnHeader />,
      cell: () => <BooleanCell />,
      sortFn: 'basic',
      enableGlobalFilter: false,
      size: 96,
      meta: { label: 'Reasoning', variant: 'boolean' },
    }),
    columnHelper.accessor(
      (row) =>
        row.addedAtMs === undefined ? undefined : new Date(row.addedAtMs),
      {
        id: 'addedAt',
        header: ({ header }) => <header.ColumnHeader />,
        cell: ({ cell }) => <cell.DateCell />,
        sortFn: 'datetime',
        sortUndefined: 'last',
        enableGlobalFilter: false,
        size: 112,
        meta: { label: 'Added', variant: 'date' },
      },
    ),
    columnHelper.accessor('source', {
      id: 'source',
      header: ({ header }) => <header.ColumnHeader />,
      cell: () => <SourceCell />,
      enableGlobalFilter: false,
      size: 128,
      meta: {
        label: 'Source',
        variant: 'select',
        options: countOptions(
          models.map((m) => m.source),
          (value) => SOURCE_LABELS[value as ModelOption['source']],
        ),
      },
    }),
  ])
}

/** Sticky placement for a pinned column, as the kitchen sink's example computes it. */
function pinningStyles(
  column: Column<typeof features, ModelRow>,
): React.CSSProperties {
  const isPinned = column.getIsPinned()
  const isLastStart = isPinned === 'start' && column.getIsLastColumn('start')
  const isFirstEnd = isPinned === 'end' && column.getIsFirstColumn('end')
  return {
    boxShadow: isLastStart
      ? '-1px 0 0 0 var(--line-separator) inset'
      : isFirstEnd
        ? '1px 0 0 0 var(--line-separator) inset'
        : undefined,
    insetInlineStart:
      isPinned === 'start' ? `${column.getStart('start')}px` : undefined,
    insetInlineEnd:
      isPinned === 'end' ? `${column.getAfter('end')}px` : undefined,
    position: isPinned ? 'sticky' : 'relative',
    zIndex: isPinned ? 1 : 0,
  }
}

export function ModelsTable({
  models,
  starred,
  onToggleStar,
  selected,
}: {
  models: readonly ModelOption[]
  /** Model refs. */
  starred: readonly string[]
  onToggleStar: (ref: string) => void
  /** The picked model ref, marked "In use". */
  selected: string | undefined
}): React.JSX.Element {
  const [columnFilters, setColumnFilters] = React.useState<
    Array<ExtendedColumnFilter>
  >([])
  const [globalFilter, setGlobalFilter] = React.useState('')

  const data = React.useMemo(() => {
    const stars = new Set(starred)
    return models.map((model): ModelRow => ({
      ...model,
      starred: stars.has(model.ref),
      inUse: model.ref === selected,
    }))
  }, [models, starred, selected])

  const columns = React.useMemo(() => modelColumns(models), [models])

  const table = useAppTable(
    {
      columns,
      data,
      getRowId: (row) => row.ref,
      state: { columnFilters, globalFilter },
      onColumnFiltersChange: setColumnFilters,
      onGlobalFilterChange: setGlobalFilter,
      // Starring a model changes the data; the page the person is on should stay.
      autoResetPageIndex: false,
      initialState: {
        sorting: [
          { id: 'starred', desc: true },
          { id: 'name', desc: false },
        ],
        pagination: { pageIndex: 0, pageSize: 50 },
        columnVisibility: { maxOutput: false, source: false, addedAt: false },
        columnPinning: { start: ['starred', 'name'], end: [] },
        columnOrder: columns.map((c) => c.id ?? ''),
      },
    },
    (state) => state,
  )

  const pinnedCell = (pinned: false | 'start' | 'end') =>
    pinned ? 'bg-raised group-hover/row:bg-hover' : undefined

  return (
    <ToggleStarContext.Provider value={onToggleStar}>
      <table.AppTable>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 flex-1">
              <Icon.Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" />
              <DebouncedInput
                value={globalFilter}
                onChange={(value) => setGlobalFilter(String(value))}
                placeholder="Search models..."
                aria-label="Search models"
                className="h-7 pl-8 text-sm"
              />
            </div>
            <table.FilterList />
            <table.SortList />
            <table.ViewOptions />
          </div>
          <div className="overflow-hidden rounded-lg border border-separator bg-raised">
            <Table
              containerClassName="max-h-[min(70vh,44rem)] overflow-auto"
              style={{ width: table.getTotalSize(), minWidth: '100%' }}
            >
              <TableHeader className="sticky top-0 z-20 bg-raised [&_tr]:border-separator">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="hover:bg-transparent"
                  >
                    {headerGroup.headers
                      .filter((header) => header.column.getIsVisible())
                      .map((header) => (
                        <table.AppHeader header={header} key={header.id}>
                          {(h) => (
                            <TableHead
                              colSpan={h.colSpan}
                              className={cn(
                                'relative h-9',
                                h.column.id === 'starred' && 'px-0',
                                h.column.getIsPinned() && 'bg-raised',
                              )}
                              style={{
                                flexGrow: h.getSize(),
                                width: h.getSize(),
                                ...pinningStyles(h.column),
                              }}
                            >
                              {h.isPlaceholder ? null : <h.FlexRender />}
                              <h.ResizeHandle />
                            </TableHead>
                          )}
                        </table.AppHeader>
                      ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="group/row border-separator"
                      data-in-use={row.original.inUse ? '' : undefined}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <table.AppCell cell={cell} key={cell.id}>
                          {(c) => (
                            <TableCell
                              className={cn(
                                'py-1.5 text-sm text-ink',
                                c.column.id === 'starred' &&
                                  'justify-center px-0',
                                pinnedCell(c.column.getIsPinned()),
                              )}
                              style={{
                                flexGrow: c.column.getSize(),
                                width: c.column.getSize(),
                                ...pinningStyles(c.column),
                              }}
                            >
                              <c.FlexRender />
                            </TableCell>
                          )}
                        </table.AppCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="w-full justify-center py-8 text-sm text-ink-muted">
                      No model matches.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <table.Pagination pageSizeOptions={[25, 50, 100]} noun="model" />
        </div>
      </table.AppTable>
    </ToggleStarContext.Provider>
  )
}
