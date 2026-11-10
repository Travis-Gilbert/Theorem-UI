// SOURCING: TanStack Table v9 through the app's kit hook (useAppTable: the columns are a row's fields, their visibility is the view's display fields, row selection is the multi-select), TanStack Virtual for the grouped rows, @tanstack/react-hotkeys for keys scoped to the focused list; behaviour after Linear's issue list
import { useHotkeys } from '@tanstack/react-hotkeys'
import type { RowSelectionState } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Checkbox } from '@/components/coss/checkbox'
import {
  createAppColumnHelper,
  useAppTable,
} from '@/components/data-table/table-hook'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import { shownFields } from './draft'
import type { DisplayField } from './draft'
import { EDIT_LABEL } from './edits'
import type { EditField } from './edits'
import {
  AssigneesField,
  DueField,
  KeyField,
  LabelsField,
  MilestoneField,
  PriorityField,
  ProjectField,
  PullRequestField,
  RepoField,
  StatusField,
  UpdatedField,
} from './fields'
import { isEmptyFilter } from './filter'
import { defaultsFor, flattenGroups, groupItems } from './grouping'
import type { ListRow } from './grouping'
import { GroupMark } from './group-mark'
import { fromControl } from './keys'
import { NewItemDialog } from './new-item'
import type { NewItemDefaults } from './new-item'
import { EditErrorContext, Notice, useNotice } from './notice'
import { FieldPicker, useQuickEdit } from './pickers'
import { flattenPages, useWorkFacets, useWorkItems } from './queries'
import { useWorkSource } from './source'
import { WorkEmpty } from './states'
import type { ViewState } from './view-state'
import { EMPTY_FILTER } from './contract'
import type { WorkGroupBy, WorkItem, WorkQuery } from './contract'

const ROW_HEIGHT = 36
const GROUP_HEIGHT = 32
/** Every loaded item is one page of the table; the virtualizer draws what is in view. */
const ALL_ROWS = { pageIndex: 0, pageSize: Number.MAX_SAFE_INTEGER }
const BULK_FIELDS: EditField[] = ['status', 'priority', 'assignee', 'label']
const OPTIONAL: DisplayField[] = [
  'key',
  'priority',
  'labels',
  'pullRequest',
  'project',
  'milestone',
  'repo',
  'assignees',
  'dueAt',
  'updatedAt',
]

const columnHelper = createAppColumnHelper<WorkItem>()

const columns = columnHelper.columns([
  columnHelper.display({
    id: 'select',
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Select ${row.original.key}`}
        checked={row.getIsSelected()}
        onClick={(event) => event.stopPropagation()}
        onCheckedChange={() => row.toggleSelected()}
      />
    ),
  }),
  columnHelper.display({
    id: 'priority',
    cell: ({ row }) => <PriorityField item={row.original} />,
  }),
  columnHelper.display({
    id: 'key',
    cell: ({ row }) => <KeyField item={row.original} />,
  }),
  columnHelper.display({
    id: 'status',
    cell: ({ row }) => <StatusField item={row.original} />,
  }),
  columnHelper.display({
    id: 'title',
    cell: ({ row }) => {
      const done = ['completed', 'canceled'].includes(row.original.status.category)
      return (
        <span className={cn('truncate text-sm', done ? 'text-ink-muted' : 'text-ink')}>
          {row.original.title}
        </span>
      )
    },
  }),
  columnHelper.display({
    id: 'labels',
    cell: ({ row }) => <LabelsField item={row.original} />,
  }),
  columnHelper.display({
    id: 'pullRequest',
    cell: ({ row }) => <PullRequestField item={row.original} />,
  }),
  columnHelper.display({
    id: 'project',
    cell: ({ row }) => <ProjectField item={row.original} />,
  }),
  columnHelper.display({
    id: 'milestone',
    cell: ({ row }) => <MilestoneField item={row.original} />,
  }),
  columnHelper.display({
    id: 'repo',
    cell: ({ row }) => <RepoField item={row.original} />,
  }),
  columnHelper.display({
    id: 'assignees',
    cell: ({ row }) => <AssigneesField item={row.original} />,
  }),
  columnHelper.display({
    id: 'dueAt',
    cell: ({ row }) => <DueField item={row.original} />,
  }),
  columnHelper.display({
    id: 'updatedAt',
    cell: ({ row }) => <UpdatedField item={row.original} />,
  }),
])

/**
 * How wide a cell is allowed to be; the title takes what is left. The fields
 * that say least about the row step aside as the list narrows (container
 * queries on the grid, so an open inspector counts), so the title keeps its room.
 */
const CELL: Record<string, string> = {
  select: 'w-5 shrink-0',
  key: 'w-[4.5rem] shrink-0',
  title: 'min-w-0 flex-1',
  labels: 'hidden min-w-0 shrink overflow-hidden @3xl:flex',
  pullRequest: 'hidden shrink-0 @3xl:flex',
  milestone: 'hidden shrink-0 @3xl:flex',
  repo: 'hidden shrink-0 @3xl:flex',
  project: 'hidden shrink-0 @2xl:flex',
}

type ItemRow = Extract<ListRow, { type: 'item' }>

const rowKey = (row: ListRow) =>
  row.type === 'group' ? `g:${row.group.key}` : `${row.groupKey}:${row.item.id}`

type Picker = { field: EditField; anchor: Element; ids: string[] }

function ListBody({
  query,
  displayFields,
  groupBy,
  selectedId,
  onOpen,
  onClearFilter,
}: {
  query: Omit<WorkQuery, 'cursor'>
  displayFields: string[]
  groupBy: WorkGroupBy
  selectedId?: string
  onOpen?: (itemId: string) => void
  onClearFilter: () => void
}) {
  const source = useWorkSource()
  const facets = useWorkFacets().data
  const items = useWorkItems(query)
  const { notice, say, clear } = useNotice()
  const edit = useQuickEdit(say)
  const { items: loaded, groups } = useMemo(
    () => flattenPages(items.data),
    [items.data],
  )

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [focusKey, setFocusKey] = useState<string>()
  const [picker, setPicker] = useState<Picker>()
  const [creating, setCreating] = useState<NewItemDefaults>()
  const list = useRef<HTMLDivElement>(null)

  const flat = useMemo<ListRow[]>(
    () =>
      groupBy
        ? flattenGroups(groupItems(loaded, groupBy, groups), collapsed)
        : loaded.map((item) => ({ type: 'item', item, groupKey: '' })),
    [loaded, groupBy, groups, collapsed],
  )
  const itemRows = useMemo(
    () => flat.filter((r): r is ItemRow => r.type === 'item'),
    [flat],
  )

  const shown = shownFields(displayFields)
  const table = useAppTable({
    columns,
    data: loaded,
    getRowId: (item) => item.id,
    state: {
      columnVisibility: Object.fromEntries(
        OPTIONAL.map((id) => [id, shown.has(id)]),
      ),
      pagination: ALL_ROWS,
      rowSelection,
    },
    onRowSelectionChange: (updater) =>
      setRowSelection((old) =>
        typeof updater === 'function' ? updater(old) : updater,
      ),
    enableRowSelection: true,
    autoResetPageIndex: false,
  })
  const rowOf = new Map(table.getRowModel().rows.map((r) => [r.id, r]))
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])

  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => list.current,
    estimateSize: (index) =>
      flat[index]?.type === 'group' ? GROUP_HEIGHT : ROW_HEIGHT,
    getItemKey: (index) => (flat[index] ? rowKey(flat[index]) : index),
    overscan: 12,
  })

  // Load the next page as the end comes into view.
  const lastIndex = virtualizer.getVirtualItems().at(-1)?.index ?? 0
  useEffect(() => {
    if (
      lastIndex >= flat.length - 20 &&
      items.hasNextPage &&
      !items.isFetchingNextPage
    )
      void items.fetchNextPage()
  }, [lastIndex, flat.length, items])

  // Navigation and shortcuts

  const focusAt = itemRows.findIndex((r) => rowKey(r) === focusKey)
  const focused = itemRows[focusAt]
  const move = (delta: 1 | -1) => {
    const at = focusAt < 0 ? (delta > 0 ? 0 : itemRows.length - 1) : focusAt + delta
    const next = itemRows[Math.min(itemRows.length - 1, Math.max(0, at))]
    if (!next) return
    setFocusKey(rowKey(next))
    virtualizer.scrollToIndex(flat.indexOf(next))
  }
  const openPicker = (field: EditField, anchor?: Element) => {
    const ids = selectedIds.length ? selectedIds : focused ? [focused.item.id] : []
    const target =
      anchor ??
      list.current?.querySelector(`[data-row-key="${CSS.escape(focusKey ?? '')}"]`) ??
      list.current
    if (edit.canEdit && ids.length && target) setPicker({ field, anchor: target, ids })
  }
  const clearSelection = () => setRowSelection({})
  const guard =
    (run: () => void) => (event: KeyboardEvent) => {
      if (!fromControl(event, list.current)) run()
    }

  useHotkeys(
    [
      { hotkey: 'ArrowDown', callback: guard(() => move(1)) },
      { hotkey: 'ArrowUp', callback: guard(() => move(-1)) },
      {
        hotkey: 'X',
        callback: guard(() => focused && rowOf.get(focused.item.id)?.toggleSelected()),
      },
      {
        hotkey: 'Enter',
        callback: guard(() => focused && onOpen?.(focused.item.id)),
      },
      { hotkey: 'S', callback: guard(() => openPicker('status')) },
      { hotkey: 'P', callback: guard(() => openPicker('priority')) },
      { hotkey: 'A', callback: guard(() => openPicker('assignee')) },
      { hotkey: 'L', callback: guard(() => openPicker('label')) },
      {
        hotkey: 'C',
        callback: guard(
          () =>
            source.createItem &&
            setCreating(focused ? defaultsFor(groupBy, focused.groupKey) : {}),
        ),
      },
      { hotkey: 'Escape', callback: guard(clearSelection) },
    ],
    { target: list, preventDefault: true, enabled: !picker && !creating },
  )

  const pickerItems = picker
    ? picker.ids.flatMap((id) => loaded.find((i) => i.id === id) ?? [])
    : []

  if (items.isPending)
    return (
      <div className="flex flex-col gap-px p-2" aria-busy>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-md" />
        ))}
      </div>
    )
  if (items.isError && !items.data)
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm">
        <span className="text-error-ink">{describeError(items.error)}</span>
        <Button size="sm" variant="outline" onClick={() => void items.refetch()}>
          Try again
        </Button>
      </div>
    )
  if (!loaded.length)
    return (
      <>
        <WorkEmpty
          filtered={!isEmptyFilter(query.filter ?? EMPTY_FILTER)}
          onClear={onClearFilter}
          onCreate={source.createItem ? () => setCreating({}) : undefined}
        />
        {creating && (
          <NewItemDialog
            open
            onOpenChange={(open) => !open && setCreating(undefined)}
            defaults={creating}
          />
        )}
      </>
    )

  return (
    <EditErrorContext.Provider value={say}>
      <Notice notice={notice} onClear={clear} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={list}
          role="grid"
          tabIndex={0}
          aria-label="Work items"
          aria-rowcount={flat.length}
          aria-multiselectable
          className="group/list @container min-h-0 flex-1 overflow-auto outline-none"
        >
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtual) => {
              const entry = flat[virtual.index]
              if (!entry) return null
              const key = rowKey(entry)
              const style = {
                height: virtual.size,
                transform: `translateY(${virtual.start}px)`,
              }
              if (entry.type === 'group') {
                const { group } = entry
                const closed = collapsed.has(group.key)
                return (
                  <div
                    key={key}
                    role="row"
                    aria-rowindex={virtual.index + 1}
                    className="absolute inset-x-0 flex items-center gap-2 border-b border-separator/60 bg-pill/60 px-3"
                    style={style}
                  >
                    <button
                      type="button"
                      aria-expanded={!closed}
                      onClick={() =>
                        setCollapsed((held) => {
                          const next = new Set(held)
                          if (!next.delete(group.key)) next.add(group.key)
                          return next
                        })
                      }
                      className="flex min-w-0 items-center gap-2 rounded-md py-1 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <Icon.ChevronDown
                        className={cn(
                          'size-3.5 shrink-0 text-ink-faint transition-transform',
                          closed && '-rotate-90',
                        )}
                      />
                      {groupBy && (
                        <GroupMark
                          groupBy={groupBy}
                          groupKey={group.key}
                          facets={facets}
                        />
                      )}
                      <span className="truncate">{group.label}</span>
                      <span className="text-ink-faint tabular-nums">
                        {group.count}
                      </span>
                    </button>
                    <span className="flex-1" />
                    {source.createItem && (
                      <button
                        type="button"
                        aria-label={`New item in ${group.label}`}
                        onClick={() => setCreating(defaultsFor(groupBy, group.key))}
                        className="rounded-md p-1 text-ink-faint hover:bg-hover hover:text-ink"
                      >
                        <Icon.Add className="size-3.5" />
                      </button>
                    )}
                  </div>
                )
              }
              const row = rowOf.get(entry.item.id)
              if (!row) return null
              const active = entry.item.id === selectedId
              const selected = row.getIsSelected()
              return (
                <div
                  key={key}
                  role="row"
                  data-row-key={key}
                  aria-rowindex={virtual.index + 1}
                  aria-selected={selected}
                  onClick={() => {
                    setFocusKey(key)
                    list.current?.focus()
                    onOpen?.(entry.item.id)
                  }}
                  className={cn(
                    'absolute inset-x-0 flex cursor-default items-center gap-2 border-b border-separator/60 px-3',
                    active
                      ? 'bg-selected'
                      : selected
                        ? 'bg-hover'
                        : 'hover:bg-hover',
                    key === focusKey &&
                      'group-focus-visible/list:outline-2 group-focus-visible/list:-outline-offset-2 group-focus-visible/list:outline-focus',
                  )}
                  style={style}
                >
                  {row.getVisibleCells().map((cell) => (
                    <table.AppCell cell={cell} key={cell.id}>
                      {(c) => (
                        <div
                          role="gridcell"
                          className={cn('flex items-center', CELL[c.column.id] ?? 'shrink-0')}
                        >
                          <c.FlexRender />
                        </div>
                      )}
                    </table.AppCell>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div
            role="toolbar"
            aria-label="Selected items"
            className="absolute inset-x-0 bottom-3 mx-auto flex w-fit items-center gap-1 rounded-lg border border-separator bg-raised px-2 py-1 shadow-lg"
          >
            <span className="px-2 text-sm tabular-nums">
              {selectedIds.length} selected
            </span>
            {edit.canEdit &&
              BULK_FIELDS.map((field) => (
                <Button
                  key={field}
                  size="sm"
                  variant="ghost"
                  onClick={(event) => openPicker(field, event.currentTarget)}
                >
                  {EDIT_LABEL[field]}
                </Button>
              ))}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Clear selection"
              onClick={clearSelection}
            >
              <Icon.Close />
            </Button>
          </div>
        )}
      </div>

      {picker && (
        <FieldPicker
          field={picker.field}
          items={pickerItems}
          anchor={picker.anchor}
          onClose={() => {
            setPicker(undefined)
            list.current?.focus()
          }}
          onChoose={(value) => edit.choose(pickerItems, picker.field, value)}
        />
      )}
      {creating && (
        <NewItemDialog
          open
          onOpenChange={(open) => !open && setCreating(undefined)}
          defaults={creating}
        />
      )}
    </EditErrorContext.Provider>
  )
}

/**
 * Items as rows: grouped under collapsible headers when the view groups, with
 * the fields the view shows, quick edits on each, and keys for the focused
 * row (up/down, x select, enter open, s status, p priority, a assign, l label,
 * c new). The view and its unsaved changes come in as `state`.
 */
export function WorkList({
  state,
  selectedId,
  onOpen,
}: {
  state: ViewState
  selectedId?: string
  onOpen?: (itemId: string) => void
}) {
  const { view, query } = state
  if (!view || !query) return null
  return (
    <ListBody
      query={query}
      displayFields={view.displayFields}
      groupBy={view.groupBy}
      selectedId={selectedId}
      onOpen={onOpen}
      onClearFilter={() => state.edit({ filter: EMPTY_FILTER })}
    />
  )
}
