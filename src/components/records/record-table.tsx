// SOURCING: TanStack Table v9 through the app's kit hook (useAppTable with the kit's FilterList, SortList, ViewOptions and ResizeHandle; sizing, pinning, ordering, visibility and row selection), TanStack Virtual for rows (Table's virtualized-rows example), coss ui Menu, Popover and Checkbox, d3-dsv for CSV export; behaviour after Twenty's record table (twenty-front record-table: column menu, "+" column, Add New, Calculate footer, three-level focus, Enter/Tab/Escape-saves, empty states)
import type { RowSelectionState } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { csvFormatRows } from 'd3-dsv'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { Checkbox } from '@/components/coss/checkbox'
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from '@/components/coss/menu'
import { Popover, PopoverPopup } from '@/components/coss/popover'
import { DebouncedInput } from '@/components/data-table/debounced-input'
import {
  createAppColumnHelper,
  useAppTable,
} from '@/components/data-table/table-hook'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import {
  AGGREGATE_LABEL,
  aggregateOptions,
  computeAggregate,
  formatAggregate,
} from './aggregate'
import type { AggregateOp } from './aggregate'
import type { DataModel, FieldSpec, ObjectType, RecordRow } from './contract'
import {
  FieldDisplay,
  FieldEditor,
  FieldTypeIcon,
  KIND,
  columnMeta,
  isEditable,
  sortValue,
} from './fields'
import type { Move } from './fields'
import { displayHint, identifierField, recordTitle } from './model'
import {
  flattenRows,
  useCreateRecord,
  useDeleteRecords,
  useRecordWrites,
  useRecords,
  useRelationTitleOf,
  useUpdateRecord,
} from './queries'
import { useRecordViewState } from './view-state'
import type { RecordViewState } from './view-state'

const ROW_HEIGHT = 32
const SELECT = '__select'
const ADD = '__add'
const MIN_WIDTH = 104
/** Every loaded row is one page; the virtualizer draws only what is in view. */
const ALL_ROWS = { pageIndex: 0, pageSize: Number.MAX_SAFE_INTEGER }

const columnHelper = createAppColumnHelper<RecordRow>()

type Focus = { row: number; col: string }
type Editing = {
  rowId: string
  col: string
  typed?: string
  anchor: Element | null
}

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export type RecordTableProps = {
  objectType: ObjectType
  model: DataModel
  /** Keys the saved arrangement; one per view the table appears in. */
  viewKey: string
  /** Fields the view shows, in order; every field when absent. */
  fieldKeys?: string[]
  /** The record open beside the table, drawn as the active row. */
  activeRecordId?: string
  onOpenRecord: (recordId: string) => void
  onOpenRelated?: (nameSingular: string, recordId: string) => void
  onEditFields?: () => void
}

/** Twenty's record table over one declared type of the schema register. */
export function RecordTable({
  objectType,
  model,
  viewKey,
  fieldKeys,
  activeRecordId,
  onOpenRecord,
  onOpenRelated,
  onEditFields,
}: RecordTableProps) {
  const records = useRecords(objectType)
  const rows = useMemo(() => flattenRows(records.data), [records.data])
  const update = useUpdateRecord(objectType)
  const create = useCreateRecord(objectType)
  const remove = useDeleteRecords(objectType)
  const writes = useRecordWrites()
  const writable = writes === true
  const editable = (field: FieldSpec) => writable && isEditable(field)
  const titleOf = useRelationTitleOf(model, objectType)

  const identifier = identifierField(objectType)
  const fields = useMemo(() => {
    const all = objectType.fields
    if (!fieldKeys?.length) return all
    return fieldKeys.flatMap((key) => all.find((f) => f.key === key) ?? [])
  }, [objectType.fields, fieldKeys])
  const fieldOf = useMemo(
    () => new Map(objectType.fields.map((f) => [f.key, f])),
    [objectType.fields],
  )

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: SELECT,
          size: 32,
          minSize: 32,
          enableResizing: false,
          enableHiding: false,
          enableSorting: false,
        }),
        ...fields.map((field) => {
          const kind = field.field_type.kind
          const sortable = ![
            'enum_many',
            'json',
            'vector',
            'geometry',
          ].includes(kind)
          return columnHelper.accessor(
            (row) =>
              sortValue(row, field, (f, id) => titleOf(f.key, id)) ?? undefined,
            {
              id: field.key,
              header: field.label,
              size: Math.max(MIN_WIDTH, KIND[kind].width),
              minSize: MIN_WIDTH,
              meta: columnMeta(field),
              enableSorting: sortable,
              sortFn:
                kind === 'integer' || kind === 'number' || kind === 'boolean'
                  ? 'basic'
                  : 'alphanumeric',
              sortUndefined: 'last',
              enableHiding: field.key !== identifier?.key,
              enableGlobalFilter: kind !== 'vector' && kind !== 'geometry',
            },
          )
        }),
        columnHelper.display({
          id: ADD,
          size: 40,
          minSize: 40,
          enableResizing: false,
          enableHiding: false,
          enableSorting: false,
        }),
      ]),
    [fields, identifier?.key, titleOf],
  )

  const initialState = (): RecordViewState => ({
    sorting: [],
    columnFilters: [],
    columnOrder: columns.map((c) => c.id ?? ''),
    columnSizing: {},
    // System fields start hidden, as Twenty's hidden-fields list does.
    columnVisibility: Object.fromEntries(
      fields
        .filter((f) => f.system && f.key !== identifier?.key)
        .map((f) => [f.key, false]),
    ),
    aggregates: {},
  })
  const [view, setView, resetView] = useRecordViewState(
    `${viewKey}:${objectType.object_type_id}`,
    initialState,
  )
  // A field added since the arrangement was saved joins before the "+" column.
  const columnOrder = useMemo(() => {
    const ids = columns.map((c) => c.id ?? '')
    const saved = view.columnOrder.filter(
      (id) => ids.includes(id) && id !== ADD,
    )
    return [
      ...saved,
      ...ids.filter((id) => !saved.includes(id) && id !== ADD),
      ADD,
    ]
  }, [columns, view.columnOrder])

  const [globalFilter, setGlobalFilter] = useState('')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const set =
    <TKey extends keyof RecordViewState>(key: TKey) =>
    (
      updater:
        | RecordViewState[TKey]
        | ((old: RecordViewState[TKey]) => RecordViewState[TKey]),
    ) =>
      setView((old) => ({
        ...old,
        [key]: typeof updater === 'function' ? updater(old[key]) : updater,
      }))

  const table = useAppTable({
    columns,
    data: rows,
    getRowId: (row) => row.id,
    state: {
      sorting: view.sorting,
      columnFilters: view.columnFilters,
      columnOrder,
      columnSizing: view.columnSizing,
      columnVisibility: view.columnVisibility,
      columnPinning: {
        start: identifier ? [SELECT, identifier.key] : [SELECT],
        end: [],
      },
      pagination: ALL_ROWS,
      globalFilter,
      rowSelection,
    },
    onSortingChange: set('sorting'),
    onColumnFiltersChange: set('columnFilters'),
    onColumnOrderChange: set('columnOrder'),
    onColumnSizingChange: set('columnSizing'),
    onColumnVisibilityChange: set('columnVisibility'),
    onGlobalFilterChange: (updater) =>
      setGlobalFilter((old) =>
        String(typeof updater === 'function' ? updater(old) : updater),
      ),
    onRowSelectionChange: (updater) =>
      setRowSelection((old) =>
        typeof updater === 'function' ? updater(old) : updater,
      ),
    enableRowSelection: true,
    autoResetPageIndex: false,
  })

  const shown = table.getRowModel().rows
  const leaf = [
    ...table.getStartVisibleLeafColumns(),
    ...table.getCenterVisibleLeafColumns(),
    ...table.getEndVisibleLeafColumns(),
  ]
  const headerOf = new Map(table.getFlatHeaders().map((h) => [h.column.id, h]))
  const navigable = leaf
    .filter((c) => c.id !== SELECT && c.id !== ADD)
    .map((c) => c.id)
  const hidden = objectType.fields.filter(
    (f) => fields.includes(f) && view.columnVisibility[f.key] === false,
  )
  const totalWidth = table.getTotalSize()
  const selected = table.getSelectedRowModel().rows.map((r) => r.original)

  // Focus and editing

  const gridRef = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState<Focus | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null)
  const [writeError, setWriteError] = useState<unknown>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const filterAnchor = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: shown.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => shown[index]?.id ?? index,
    overscan: 12,
  })

  // Load the next page as the end comes into view.
  const lastIndex = virtualizer.getVirtualItems().at(-1)?.index ?? 0
  useEffect(() => {
    if (
      lastIndex >= shown.length - 20 &&
      records.hasNextPage &&
      !records.isFetchingNextPage
    )
      void records.fetchNextPage()
  }, [lastIndex, shown.length, records])

  const cellKey = (rowId: string, col: string) => `${rowId}\u0000${col}`
  const cellElement = (rowId: string, col: string) =>
    gridRef.current?.querySelector(
      `[data-cell="${CSS.escape(cellKey(rowId, col))}"]`,
    ) ?? null

  const moveFocus = (from: Focus, move: Move) => {
    const at = navigable.indexOf(from.col)
    let row = from.row
    let col = at
    if (move === 'down') row = Math.min(shown.length - 1, row + 1)
    if (move === 'up') row = Math.max(0, row - 1)
    if (move === 'right') {
      if (col < navigable.length - 1) col++
      else if (row < shown.length - 1) [row, col] = [row + 1, 0]
    }
    if (move === 'left') {
      if (col > 0) col--
      else if (row > 0) [row, col] = [row - 1, navigable.length - 1]
    }
    const next = { row, col: navigable[col]! }
    setFocus(next)
    virtualizer.scrollToIndex(row)
    return next
  }

  const write = (row: RecordRow, field: FieldSpec, value: unknown) => {
    if (sameValue(row.values[field.key], value)) return
    setWriteError(null)
    update.mutate(
      { id: row.id, patch: { [field.key]: value } },
      { onError: setWriteError },
    )
  }

  const startEdit = (rowIndex: number, col: string, typed?: string) => {
    const row = shown[rowIndex]?.original
    const field = fieldOf.get(col)
    if (!row || !field || !editable(field)) return
    const kind = field.field_type.kind
    if (KIND[kind].edit === 'toggle') {
      write(row, field, !(row.values[field.key] === true))
      return
    }
    if (displayHint(objectType, field.key)?.display === 'rating') return
    setFocus({ row: rowIndex, col })
    setEditing({ rowId: row.id, col, typed, anchor: cellElement(row.id, col) })
  }

  const commit = (
    row: RecordRow,
    field: FieldSpec,
    value: unknown,
    move?: Move,
  ) => {
    setEditing(null)
    write(row, field, value)
    const index = shown.findIndex((r) => r.id === row.id)
    if (move && index >= 0) moveFocus({ row: index, col: field.key }, move)
    requestAnimationFrame(() => gridRef.current?.focus({ preventScroll: true }))
  }

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing || event.target !== gridRef.current) return
    if (!focus) {
      if (
        ['ArrowDown', 'ArrowUp', 'j', 'k'].includes(event.key) &&
        shown.length
      ) {
        event.preventDefault()
        setFocus({ row: 0, col: navigable[0]! })
      }
      return
    }
    const row = shown[focus.row]?.original
    const arrows: Record<string, Move> = {
      ArrowDown: 'down',
      ArrowUp: 'up',
      ArrowRight: 'right',
      ArrowLeft: 'left',
    }
    if (arrows[event.key]) {
      event.preventDefault()
      moveFocus(focus, arrows[event.key]!)
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (row) onOpenRecord(row.id)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      startEdit(focus.row, focus.col)
    } else if (event.key === 'Escape') {
      setFocus(null)
      table.resetRowSelection()
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      const field = fieldOf.get(focus.col)
      if (row && field && editable(field)) {
        event.preventDefault()
        write(row, field, field.field_type.kind === 'enum_many' ? [] : null)
      }
    } else if (
      event.key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      const field = fieldOf.get(focus.col)
      if (field && KIND[field.field_type.kind].edit === 'inline') {
        event.preventDefault()
        startEdit(focus.row, focus.col, event.key)
      }
    }
  }

  const toggleRow = (index: number, shift: boolean) => {
    const row = shown[index]
    if (!row) return
    if (shift && anchorIndex !== null) {
      const [from, to] = [
        Math.min(anchorIndex, index),
        Math.max(anchorIndex, index),
      ]
      const value = !row.getIsSelected()
      setRowSelection((old) => {
        const next = { ...old }
        for (const r of shown.slice(from, to + 1))
          if (value) next[r.id] = true
          else delete next[r.id]
        return next
      })
    } else row.toggleSelected()
    setAnchorIndex(index)
  }

  const addRecord = (name: string) => {
    const text = name.trim()
    setDraft(null)
    if (!text || !identifier) return
    setWriteError(null)
    create.mutate({ [identifier.key]: text }, { onError: setWriteError })
  }

  const exportCsv = (which: RecordRow[]) => {
    const cols = leaf.filter((c) => fieldOf.has(c.id))
    const lines = [
      cols.map((c) => fieldOf.get(c.id)!.label),
      ...which.map((row) =>
        cols.map((c) => {
          const v = sortValue(row, fieldOf.get(c.id)!, (f, id) =>
            titleOf(f.key, id),
          )
          return v === null || v === undefined
            ? ''
            : typeof v === 'object'
              ? JSON.stringify(v)
              : String(v)
        }),
      ),
    ]
    const url = URL.createObjectURL(
      new Blob([csvFormatRows(lines)], { type: 'text/csv' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `${objectType.name_plural}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Rendering

  const pinStyle = (column: (typeof leaf)[number]): CSSProperties =>
    column.getIsPinned() === 'start'
      ? { position: 'sticky', left: column.getStart('start'), zIndex: 2 }
      : {}

  const width = (column: (typeof leaf)[number]) => ({
    width: column.getSize(),
    minWidth: column.getSize(),
  })

  const label = objectType.label_plural
  const filtering = globalFilter !== '' || view.columnFilters.length > 0
  const editingRow = editing
    ? rows.find((r) => r.id === editing.rowId)
    : undefined
  const editingField = editing ? fieldOf.get(editing.col) : undefined

  return (
    <table.AppTable>
      <div className="flex min-h-0 min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink">
            <span className="truncate">{label}</span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink-faint tabular-nums">
              {selected.length ? `${selected.length} selected` : shown.length}
            </span>
          </h2>
          <div className="ms-auto flex flex-wrap items-center gap-1.5">
            {selected.length ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => exportCsv(selected)}
                >
                  <Icon.Download /> Export
                </Button>
                {writable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Icon.Delete /> Delete
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => table.resetRowSelection()}
                >
                  Clear selection
                </Button>
              </>
            ) : (
              <>
                <div className="relative w-44">
                  <Icon.Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" />
                  <DebouncedInput
                    value={globalFilter}
                    onChange={(value) => setGlobalFilter(String(value))}
                    placeholder="Search any field"
                    aria-label={`Search ${label.toLowerCase()}`}
                    className="h-7 pl-8 text-sm"
                  />
                </div>
                <div ref={filterAnchor} className="contents">
                  <table.FilterList />
                </div>
                <table.SortList />
                <table.ViewOptions />
                <Menu>
                  <MenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Options"
                      />
                    }
                  >
                    <Icon.More />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    {onEditFields && (
                      <MenuItem onClick={onEditFields}>
                        <Icon.Settings /> Edit fields
                      </MenuItem>
                    )}
                    <MenuItem
                      onClick={() => exportCsv(shown.map((r) => r.original))}
                    >
                      <Icon.Download /> Export view
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem onClick={resetView}>
                      <Icon.Refresh /> Reset view
                    </MenuItem>
                  </MenuPopup>
                </Menu>
              </>
            )}
          </div>
        </div>

        {writes === false && (
          <p className="text-xs text-ink-muted">
            Read only: this Theorem cannot write records yet.
          </p>
        )}

        {writeError !== null && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-ochre/40 bg-ochre/8 px-3 py-2 text-sm"
          >
            <p className="min-w-0 flex-1">
              Theorem did not save that change. {describeError(writeError)}
            </p>
            <button
              type="button"
              className="text-xs text-ink-muted hover:text-ink"
              onClick={() => setWriteError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="relative min-h-80 overflow-hidden rounded-lg border border-separator bg-raised">
          <div
            ref={scroller}
            className="max-h-[calc(100dvh-18rem)] min-h-80 overflow-auto"
          >
            <div
              ref={gridRef}
              role="grid"
              aria-label={label}
              aria-rowcount={shown.length + 1}
              aria-colcount={navigable.length}
              tabIndex={0}
              onKeyDown={onGridKeyDown}
              onBlur={(event) => {
                if (
                  !event.currentTarget.contains(event.relatedTarget) &&
                  !editing
                )
                  setFocus(null)
              }}
              className="relative text-sm outline-none"
              style={{ width: `max(100%, ${totalWidth}px)` }}
            >
              {/* Header */}
              <div
                role="row"
                className="sticky top-0 z-10 flex border-b border-separator bg-raised"
              >
                {leaf.map((column) => {
                  const header = headerOf.get(column.id)
                  const field = fieldOf.get(column.id)
                  return (
                    <div
                      key={column.id}
                      role="columnheader"
                      className={cn(
                        'relative flex h-8 shrink-0 items-center border-e border-separator/60 bg-raised',
                        column.id === SELECT && 'justify-center',
                      )}
                      style={{ ...width(column), ...pinStyle(column) }}
                    >
                      {column.id === SELECT ? (
                        <Checkbox
                          aria-label="Select all rows"
                          disabled={!shown.length}
                          checked={table.getIsAllRowsSelected()}
                          indeterminate={
                            table.getIsSomeRowsSelected() &&
                            !table.getIsAllRowsSelected()
                          }
                          onCheckedChange={(on) =>
                            table.toggleAllRowsSelected(!!on)
                          }
                        />
                      ) : column.id === ADD ? (
                        <AddFieldMenu
                          hidden={hidden}
                          onShow={(key) =>
                            table.getColumn(key)?.toggleVisibility(true)
                          }
                          onEditFields={onEditFields}
                        />
                      ) : field ? (
                        <HeaderMenu
                          field={field}
                          isIdentifier={field.key === identifier?.key}
                          sorted={column.getIsSorted()}
                          canSort={column.getCanSort()}
                          canMoveLeft={navigable.indexOf(column.id) > 1}
                          canMoveRight={
                            navigable.indexOf(column.id) < navigable.length - 1
                          }
                          onSort={(desc) =>
                            table.setSorting([{ id: column.id, desc }])
                          }
                          onFilter={() => {
                            table.setColumnFilters((old) => [
                              ...old,
                              {
                                id: column.id,
                                value: '',
                                filterId: crypto.randomUUID(),
                              } as never,
                            ])
                            // The kit's filter list owns its popover; open it on the new row.
                            filterAnchor.current
                              ?.querySelector('button')
                              ?.click()
                          }}
                          onMove={(delta) => {
                            const order = [...columnOrder]
                            const at = order.indexOf(column.id)
                            const to = at + delta
                            if (to < 2 || to >= order.length - 1) return
                            ;[order[at], order[to]] = [order[to]!, order[at]!]
                            table.setColumnOrder(order)
                          }}
                          onHide={() => column.toggleVisibility(false)}
                        />
                      ) : null}
                      {header && column.getCanResize() && (
                        <table.AppHeader header={header}>
                          {(h) => <h.ResizeHandle />}
                        </table.AppHeader>
                      )}
                    </div>
                  )
                })}
                <div className="flex-1 bg-raised" aria-hidden />
              </div>

              {/* Rows */}
              {records.isPending ? (
                <div className="flex flex-col gap-2 p-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-5 w-full" />
                  ))}
                </div>
              ) : records.isError ? (
                <EmptyState
                  title={`${label} could not be read`}
                  detail={describeError(records.error)}
                />
              ) : !shown.length && draft === null ? (
                filtering ? (
                  <EmptyState title={`No ${label} found`} />
                ) : (
                  <EmptyState
                    title={
                      writable
                        ? `Add your first ${objectType.label_singular}`
                        : `No ${label} yet`
                    }
                    action={
                      writable &&
                      identifier && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDraft('')}
                        >
                          <Icon.Add /> Add a {objectType.label_singular}
                        </Button>
                      )
                    }
                  />
                )
              ) : (
                <div
                  className="relative"
                  style={{ height: virtualizer.getTotalSize() }}
                >
                  {virtualizer.getVirtualItems().map((item) => {
                    const row = shown[item.index]
                    if (!row) return null
                    const record = row.original
                    const active = record.id === activeRecordId
                    return (
                      <div
                        key={row.id}
                        role="row"
                        aria-rowindex={item.index + 2}
                        aria-selected={row.getIsSelected()}
                        className={cn(
                          'group/row absolute inset-x-0 flex border-b border-separator/60',
                          active
                            ? 'bg-selected'
                            : row.getIsSelected()
                              ? 'bg-hover'
                              : 'bg-raised hover:bg-hover',
                        )}
                        style={{
                          height: ROW_HEIGHT,
                          transform: `translateY(${item.start}px)`,
                        }}
                      >
                        {leaf.map((column) => {
                          const sticky = pinStyle(column)
                          const base = cn(
                            'flex h-full shrink-0 items-center border-e border-separator/60 px-2',
                            sticky.position &&
                              (active
                                ? 'bg-selected'
                                : row.getIsSelected()
                                  ? 'bg-hover'
                                  : 'bg-raised group-hover/row:bg-hover'),
                          )
                          if (column.id === SELECT)
                            return (
                              <div
                                key={column.id}
                                role="gridcell"
                                className={cn(base, 'justify-center px-0')}
                                style={{ ...width(column), ...sticky }}
                              >
                                <Checkbox
                                  aria-label={`Select ${recordTitle(objectType, record)}`}
                                  checked={row.getIsSelected()}
                                  onClick={(event) => {
                                    event.preventDefault()
                                    toggleRow(item.index, event.shiftKey)
                                  }}
                                />
                              </div>
                            )
                          if (column.id === ADD)
                            return (
                              <div
                                key={column.id}
                                className={base}
                                style={width(column)}
                                aria-hidden
                              />
                            )
                          const field = fieldOf.get(column.id)!
                          const focused =
                            focus?.row === item.index && focus.col === column.id
                          const isTitle = field.key === identifier?.key
                          return (
                            <div
                              key={column.id}
                              role="gridcell"
                              data-cell={cellKey(record.id, column.id)}
                              aria-selected={focused}
                              className={cn(
                                base,
                                'relative min-w-0 cursor-default gap-1 overflow-hidden',
                                focused &&
                                  'z-[1] outline outline-1 -outline-offset-1 outline-focus',
                              )}
                              style={{ ...width(column), ...sticky }}
                              onClick={() => {
                                setFocus({ row: item.index, col: column.id })
                                gridRef.current?.focus({ preventScroll: true })
                                if (isTitle && record.values[field.key])
                                  onOpenRecord(record.id)
                                else startEdit(item.index, column.id)
                              }}
                            >
                              {editing?.rowId === record.id &&
                              editing.col === column.id &&
                              KIND[field.field_type.kind].edit === 'inline' ? (
                                <div className="absolute inset-0 z-[3] flex items-center bg-background px-2 ring-1 ring-focus">
                                  <FieldEditor
                                    field={field}
                                    hint={displayHint(objectType, field.key)}
                                    value={record.values[field.key]}
                                    row={record}
                                    model={model}
                                    typed={editing.typed}
                                    onCommit={(value, move) =>
                                      commit(record, field, value, move)
                                    }
                                    onDiscard={() => setEditing(null)}
                                  />
                                </div>
                              ) : (
                                <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                                  <FieldDisplay
                                    row={record}
                                    field={field}
                                    hint={displayHint(objectType, field.key)}
                                    model={model}
                                    onOpenRelated={onOpenRelated}
                                    onToggle={
                                      editable(field)
                                        ? (value) => write(record, field, value)
                                        : undefined
                                    }
                                  />
                                </span>
                              )}
                              {isTitle && (
                                <span className="hidden shrink-0 items-center gap-0.5 group-hover/row:flex">
                                  <button
                                    type="button"
                                    aria-label={`Rename ${recordTitle(objectType, record)}`}
                                    className="rounded p-0.5 text-ink-faint hover:bg-hover hover:text-ink"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      startEdit(item.index, column.id)
                                    }}
                                  >
                                    <Icon.Edit className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Open ${recordTitle(objectType, record)}`}
                                    className="rounded p-0.5 text-ink-faint hover:bg-hover hover:text-ink"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      onOpenRecord(record.id)
                                    }}
                                  >
                                    <Icon.Expand className="size-3.5" />
                                  </button>
                                </span>
                              )}
                            </div>
                          )
                        })}
                        <div className="flex-1" aria-hidden />
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Add New */}
              {writable &&
                identifier &&
                !records.isPending &&
                (shown.length > 0 || draft !== null) && (
                  <div
                    role="row"
                    className="flex h-8 border-b border-separator/60 bg-raised"
                  >
                    {draft === null ? (
                      <button
                        type="button"
                        onClick={() => setDraft('')}
                        className="sticky left-0 flex items-center gap-1.5 px-3 text-sm text-ink-faint hover:text-ink"
                      >
                        <Icon.Add className="size-3.5" /> Add New
                      </button>
                    ) : (
                      <div
                        className="sticky left-0 flex items-center gap-2 ps-10 pe-2"
                        style={{
                          width:
                            32 +
                            (table.getColumn(identifier.key)?.getSize() ?? 180),
                        }}
                      >
                        <input
                          autoFocus
                          value={draft}
                          aria-label={`New ${objectType.label_singular.toLowerCase()} ${identifier.label.toLowerCase()}`}
                          placeholder={identifier.label}
                          onChange={(event) => setDraft(event.target.value)}
                          onBlur={() => addRecord(draft)}
                          onKeyDown={(event) => {
                            if (
                              event.key === 'Enter' ||
                              event.key === 'Escape'
                            ) {
                              event.preventDefault()
                              addRecord(draft)
                            }
                          }}
                          className="h-6 w-full rounded bg-background px-1.5 text-sm text-ink outline-none ring-1 ring-focus"
                        />
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>

          {/* Calculate */}
          {shown.length > 0 && (
            <div
              className="flex overflow-hidden border-t border-separator bg-raised text-xs"
              style={{ width: `max(100%, ${totalWidth}px)` }}
            >
              {leaf.map((column) => {
                const field = fieldOf.get(column.id)
                return (
                  <div
                    key={column.id}
                    className="flex h-8 shrink-0 items-center border-e border-separator/60 bg-raised"
                    style={{ ...width(column), ...pinStyle(column) }}
                  >
                    {field && (
                      <FooterCell
                        field={field}
                        op={view.aggregates[field.key]}
                        partial={records.hasNextPage}
                        values={table
                          .getFilteredRowModel()
                          .rows.map((r) => r.getValue(field.key))}
                        onChange={(op) =>
                          setView((old) => {
                            const aggregates = { ...old.aggregates }
                            if (op) aggregates[field.key] = op
                            else delete aggregates[field.key]
                            return { ...old, aggregates }
                          })
                        }
                      />
                    )}
                  </div>
                )
              })}
              <div className="flex-1" />
            </div>
          )}
        </div>
      </div>

      {editing &&
        editingRow &&
        editingField &&
        KIND[editingField.field_type.kind].edit === 'popover' && (
          <Popover
            open
            onOpenChange={(open) => {
              // A click outside saves, as Escape does; the editors save on close.
              if (!open) setEditing(null)
            }}
          >
            <PopoverPopup
              anchor={editing.anchor}
              align="start"
              sideOffset={-ROW_HEIGHT}
              className="p-0"
            >
              <FieldEditor
                field={editingField}
                hint={displayHint(objectType, editingField.key)}
                value={editingRow.values[editingField.key]}
                row={editingRow}
                model={model}
                onCommit={(value, move) =>
                  commit(editingRow, editingField, value, move)
                }
                onDiscard={() => setEditing(null)}
              />
            </PopoverPopup>
          </Popover>
        )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selected.length}{' '}
              {selected.length === 1
                ? objectType.label_singular.toLowerCase()
                : label.toLowerCase()}
              ?
            </DialogTitle>
            <DialogDescription>
              They are removed from Theorem. This cannot be undone here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDelete(false)
                setWriteError(null)
                remove.mutate(
                  selected.map((r) => r.id),
                  { onError: setWriteError },
                )
                table.resetRowSelection()
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </table.AppTable>
  )
}

function EmptyState({
  title,
  detail,
  action,
}: {
  title: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <div className="sticky left-0 flex w-full max-w-[min(100%,48rem)] flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {detail && <p className="text-sm text-ink-muted">{detail}</p>}
      {action}
    </div>
  )
}

function HeaderMenu({
  field,
  isIdentifier,
  sorted,
  canSort,
  canMoveLeft,
  canMoveRight,
  onSort,
  onFilter,
  onMove,
  onHide,
}: {
  field: FieldSpec
  isIdentifier: boolean
  sorted: false | 'asc' | 'desc'
  canSort: boolean
  canMoveLeft: boolean
  canMoveRight: boolean
  onSort: (desc: boolean) => void
  onFilter: () => void
  onMove: (delta: -1 | 1) => void
  onHide: () => void
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            className="flex h-full w-full min-w-0 items-center gap-1.5 px-2 text-start text-xs font-medium text-ink-muted hover:bg-hover hover:text-ink data-[popup-open]:bg-hover"
          />
        }
      >
        <FieldTypeIcon kind={field.field_type.kind} />
        <span className="truncate">{field.label}</span>
        {sorted &&
          (sorted === 'asc' ? (
            <Icon.ArrowUp className="size-3 shrink-0" />
          ) : (
            <Icon.ArrowDown className="size-3 shrink-0" />
          ))}
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuItem onClick={onFilter}>
          <Icon.Filter /> Filter
        </MenuItem>
        {canSort && (
          <MenuSub>
            <MenuSubTrigger>
              <Icon.UpDown /> Sort
            </MenuSubTrigger>
            <MenuSubPopup>
              <MenuItem onClick={() => onSort(false)}>
                <Icon.ArrowUp /> Ascending
              </MenuItem>
              <MenuItem onClick={() => onSort(true)}>
                <Icon.ArrowDown /> Descending
              </MenuItem>
            </MenuSubPopup>
          </MenuSub>
        )}
        {!isIdentifier && (
          <>
            <MenuSeparator />
            {canMoveLeft && (
              <MenuItem onClick={() => onMove(-1)}>
                <Icon.ChevronLeft /> Move left
              </MenuItem>
            )}
            {canMoveRight && (
              <MenuItem onClick={() => onMove(1)}>
                <Icon.ChevronRight /> Move right
              </MenuItem>
            )}
            <MenuItem onClick={onHide}>
              <Icon.Hide /> Hide
            </MenuItem>
          </>
        )}
      </MenuPopup>
    </Menu>
  )
}

function AddFieldMenu({
  hidden,
  onShow,
  onEditFields,
}: {
  hidden: FieldSpec[]
  onShow: (key: string) => void
  onEditFields?: () => void
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            aria-label="Show a field"
            className="flex h-full w-full items-center justify-center text-ink-faint hover:bg-hover hover:text-ink data-[popup-open]:bg-hover"
          />
        }
      >
        <Icon.Add className="size-3.5" />
      </MenuTrigger>
      <MenuPopup align="end" className="w-60">
        <MenuGroup>
          <MenuGroupLabel>Hidden fields</MenuGroupLabel>
          {hidden.length ? (
            hidden.map((field) => (
              <MenuCheckboxItem
                key={field.key}
                checked={false}
                onClick={() => onShow(field.key)}
              >
                <FieldTypeIcon kind={field.field_type.kind} />
                {field.label}
              </MenuCheckboxItem>
            ))
          ) : (
            <p className="px-2 py-1.5 text-sm text-ink-muted">
              All fields are already visible
            </p>
          )}
        </MenuGroup>
        {onEditFields && (
          <>
            <MenuSeparator />
            <MenuItem onClick={onEditFields}>
              <Icon.Settings /> Customize fields
            </MenuItem>
          </>
        )}
      </MenuPopup>
    </Menu>
  )
}

const OP_GROUPS: { label: string; ops: AggregateOp[] }[] = [
  { label: 'Count', ops: ['count', 'empty', 'notEmpty', 'unique'] },
  { label: 'Percent', ops: ['percentEmpty', 'percentNotEmpty'] },
  { label: 'Date', ops: ['earliest', 'latest'] },
  {
    label: 'More options',
    ops: ['min', 'max', 'average', 'sum', 'checked', 'unchecked'],
  },
]

function FooterCell({
  field,
  op,
  partial,
  values,
  onChange,
}: {
  field: FieldSpec
  op: AggregateOp | undefined
  /** More pages exist, so the figure covers only the rows loaded so far. */
  partial: boolean
  values: unknown[]
  onChange: (op: AggregateOp | undefined) => void
}) {
  const allowed = aggregateOptions(field.field_type.kind)
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            className="group flex h-full w-full min-w-0 items-center justify-end gap-1 px-2 text-ink-faint hover:bg-hover hover:text-ink data-[popup-open]:bg-hover"
          />
        }
      >
        {op ? (
          <>
            <span className="truncate">{AGGREGATE_LABEL[op]}</span>
            <span className="font-medium text-ink tabular-nums">
              {formatAggregate(op, computeAggregate(op, values))}
            </span>
            {partial && (
              <span className="shrink-0 text-ink-faint">
                of {values.length} loaded
              </span>
            )}
          </>
        ) : (
          <span className="opacity-0 transition-opacity group-hover:opacity-100 group-data-[popup-open]:opacity-100">
            Calculate
          </span>
        )}
      </MenuTrigger>
      <MenuPopup align="end">
        {OP_GROUPS.map((group) => {
          const ops = group.ops.filter((o) => allowed.includes(o))
          if (!ops.length) return null
          return (
            <MenuSub key={group.label}>
              <MenuSubTrigger>{group.label}</MenuSubTrigger>
              <MenuSubPopup>
                {ops.map((o) => (
                  <MenuCheckboxItem
                    key={o}
                    checked={op === o}
                    closeOnClick
                    onClick={() => onChange(o)}
                  >
                    {AGGREGATE_LABEL[o]}
                  </MenuCheckboxItem>
                ))}
              </MenuSubPopup>
            </MenuSub>
          )
        })}
        {op && (
          <>
            <MenuSeparator />
            <MenuItem onClick={() => onChange(undefined)}>None</MenuItem>
          </>
        )}
      </MenuPopup>
    </Menu>
  )
}
