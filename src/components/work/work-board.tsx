// SOURCING: @dnd-kit/core (draggable cards, droppable columns, drag overlay) with the same row fields and quick edits as the list (./fields); behaviour after Linear's board. A column's order is the view's order: there is no manual rank to reorder by
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import { shownFields } from './draft'
import type { DisplayField } from './draft'
import {
  AssigneesField,
  FIELD,
  KeyField,
  PriorityField,
  StatusField,
} from './fields'
import { isEmptyFilter } from './filter'
import {
  DROPPABLE,
  boardColumns,
  defaultsFor,
  dropPatch,
  groupItems,
} from './grouping'
import { GroupMark } from './group-mark'
import { NewItemDialog } from './new-item'
import type { NewItemDefaults } from './new-item'
import { EditErrorContext, Notice, useNotice } from './notice'
import {
  flattenPages,
  usePatchWorkItem,
  useWorkFacets,
  useWorkItems,
} from './queries'
import { useWorkSource } from './source'
import { WorkEmpty } from './states'
import type { ViewState } from './view-state'
import { EMPTY_FILTER } from './contract'
import type { WorkGroup, WorkGroupBy, WorkItem, WorkQuery } from './contract'

/** Pages a board fetches by itself; past that a button asks for more. */
const AUTO_PAGES = 4

/** The optional fields a card shows under its title, in order. */
const CARD_FIELDS: Array<keyof typeof FIELD> = [
  'labels',
  'pullRequest',
  'project',
  'milestone',
  'repo',
  'dueAt',
  'updatedAt',
]

type Drag = { itemId: string; from: string }

function CardBody({
  item,
  shown,
  groupBy,
}: {
  item: WorkItem
  shown: ReadonlySet<DisplayField>
  groupBy: NonNullable<WorkGroupBy>
}) {
  return (
    <>
      <div className="flex items-center gap-1">
        {shown.has('key') && <KeyField item={item} />}
        {groupBy !== 'status' && <StatusField item={item} />}
        <span className="flex-1" />
        {shown.has('priority') && groupBy !== 'priority' && (
          <PriorityField item={item} />
        )}
        {shown.has('assignees') && <AssigneesField item={item} />}
      </div>
      <p className="line-clamp-2 text-sm text-ink">{item.title}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {CARD_FIELDS.filter((id) => shown.has(id)).map((id) => {
          const Field = FIELD[id]
          return <Field key={id} item={item} />
        })}
      </div>
    </>
  )
}

function Card({
  item,
  columnKey,
  shown,
  groupBy,
  active,
  movable,
  onOpen,
}: {
  item: WorkItem
  columnKey: string
  shown: ReadonlySet<DisplayField>
  groupBy: NonNullable<WorkGroupBy>
  active: boolean
  movable: boolean
  onOpen?: (itemId: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${columnKey}:${item.id}`,
    data: { itemId: item.id, from: columnKey } satisfies Drag,
    disabled: !movable,
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`${item.key} ${item.title}`}
      onClick={() => onOpen?.(item.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget)
          onOpen?.(item.id)
      }}
      className={cn(
        'flex cursor-default flex-col gap-1.5 rounded-lg border border-separator bg-raised p-2.5 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus',
        active && 'bg-selected',
        isDragging && 'opacity-40',
      )}
    >
      <CardBody item={item} shown={shown} groupBy={groupBy} />
    </div>
  )
}

function Column({
  column,
  items,
  groupBy,
  shown,
  selectedId,
  onOpen,
  onCreate,
}: {
  column: WorkGroup
  items: WorkItem[]
  groupBy: NonNullable<WorkGroupBy>
  shown: ReadonlySet<DisplayField>
  selectedId?: string
  onOpen?: (itemId: string) => void
  onCreate?: (defaults: NewItemDefaults) => void
}) {
  const facets = useWorkFacets().data
  // A source that cannot patch offers no drag: the drop would have nothing to send.
  const movable = !!useWorkSource().patchItem && DROPPABLE.has(groupBy)
  const { setNodeRef, isOver } = useDroppable({
    id: column.key,
    disabled: !movable,
  })
  return (
    <section
      aria-label={column.label}
      className="flex w-72 shrink-0 flex-col rounded-xl bg-pill/50"
    >
      <header className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
        <GroupMark groupBy={groupBy} groupKey={column.key} facets={facets} />
        <span className="truncate">{column.label}</span>
        <span className="text-ink-faint tabular-nums">
          {Math.max(column.count, items.length)}
        </span>
        <span className="flex-1" />
        {onCreate && (
          <button
            type="button"
            aria-label={`New item in ${column.label}`}
            onClick={() => onCreate(defaultsFor(groupBy, column.key))}
            className="rounded-md p-1 text-ink-faint hover:bg-hover hover:text-ink"
          >
            <Icon.Add className="size-3.5" />
          </button>
        )}
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-b-xl p-2 transition-colors',
          isOver && 'bg-hover',
        )}
      >
        {items.map((item) => (
          <Card
            key={item.id}
            item={item}
            columnKey={column.key}
            shown={shown}
            groupBy={groupBy}
            active={item.id === selectedId}
            movable={movable}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  )
}

function BoardBody({
  query,
  displayFields,
  groupBy,
  selectedId,
  onOpen,
  onClearFilter,
}: {
  query: Omit<WorkQuery, 'cursor'>
  displayFields: string[]
  groupBy: NonNullable<WorkGroupBy>
  selectedId?: string
  onOpen?: (itemId: string) => void
  onClearFilter: () => void
}) {
  const source = useWorkSource()
  const facets = useWorkFacets().data
  const items = useWorkItems(query)
  const patch = usePatchWorkItem()
  const { notice, say, clear } = useNotice()
  const { items: loaded, groups, total } = useMemo(
    () => flattenPages(items.data),
    [items.data],
  )
  const [dragging, setDragging] = useState<Drag>()
  const [creating, setCreating] = useState<NewItemDefaults>()
  const shown = shownFields(displayFields)

  const sensors = useSensors(
    // A few pixels of travel starts a drag, so a plain click still opens the card.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const columns = useMemo(
    () => boardColumns(groupBy, facets, groups),
    [groupBy, facets, groups],
  )
  const byColumn = useMemo(
    () =>
      new Map(groupItems(loaded, groupBy, groups).map((g) => [g.key, g.items])),
    [loaded, groupBy, groups],
  )

  // Columns fill as pages arrive: fetch a few pages, then leave the rest to a button.
  const pages = items.data?.pages.length ?? 0
  useEffect(() => {
    if (items.hasNextPage && !items.isFetchingNextPage && pages < AUTO_PAGES)
      void items.fetchNextPage()
  }, [items, pages])

  const onDragStart = (event: DragStartEvent) =>
    setDragging(event.active.data.current as Drag)
  const onDragEnd = (event: DragEndEvent) => {
    setDragging(undefined)
    const from = event.active.data.current as Drag | undefined
    const to = event.over?.id
    const item = loaded.find((i) => i.id === from?.itemId)
    if (!from || !item || typeof to !== 'string') return
    const change = dropPatch(groupBy, item, from.from, to)
    if (change) patch.mutate({ id: item.id, patch: change }, { onError: say })
  }

  if (items.isPending)
    return (
      <div className="flex gap-3 p-3" aria-busy>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-xl" />
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

  const overlay = dragging
    ? loaded.find((i) => i.id === dragging.itemId)
    : undefined
  return (
    <EditErrorContext.Provider value={say}>
      <Notice notice={notice} onClear={clear} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(undefined)}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
          {columns.map((column) => (
            <Column
              key={column.key}
              column={column}
              items={byColumn.get(column.key) ?? []}
              groupBy={groupBy}
              shown={shown}
              selectedId={selectedId}
              onOpen={onOpen}
              onCreate={source.createItem ? setCreating : undefined}
            />
          ))}
          {items.hasNextPage && (
            <div className="flex shrink-0 items-start">
              <Button
                size="sm"
                variant="outline"
                disabled={items.isFetchingNextPage}
                onClick={() => void items.fetchNextPage()}
              >
                Load more ({loaded.length} of {total})
              </Button>
            </div>
          )}
        </div>
        {/* In the body: the Index's panes are containers, and a fixed overlay inside one is placed, and collided, from the container's corner. */}
        {createPortal(
          <DragOverlay>
            {overlay && (
              <div className="flex w-72 flex-col gap-1.5 rounded-lg border border-separator bg-raised p-2.5 shadow-lg">
                <CardBody item={overlay} shown={shown} groupBy={groupBy} />
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
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
 * Items as columns of cards, one column per value of the grouping (status
 * unless the view groups by something else). Dragging a card to another
 * column changes the grouped field; a card is opened by click or Enter, and
 * its status, priority and assignee change from the card itself.
 */
export function WorkBoard({
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
  const groupBy = view.groupBy ?? 'status'
  return (
    <BoardBody
      query={{ ...query, groupBy }}
      displayFields={view.displayFields}
      groupBy={groupBy}
      selectedId={selectedId}
      onOpen={onOpen}
      onClearFilter={() => state.edit({ filter: EMPTY_FILTER })}
    />
  )
}
