// SOURCING: after Twenty's record board (a column per value of one select field, the count beside its name, compact cards with the chosen fields, a card dragged to another column takes that value); @dnd-kit/core useDraggable/useDroppable with its pointer and keyboard sensors and announcements, as organize/thread-row.tsx and crm/header-drag.tsx use it; records/queries useUpdateRecord for the write, so the board is the register's own update verb and the object page stays the place to edit everything else.
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { useEffect, useState } from 'react'
import { FieldDisplay } from '@/components/records/fields'
import type { FieldSpec } from '@/components/records/contract'
import { displayHint, isEmptyValue } from '@/components/records/model'
import { useUpdateRecord } from '@/components/records/queries'
import { describeError } from '@/lib/theorem/client'
import type { ObjectClass } from '@/lib/objects/classes'
import { notesExtension } from '@/lib/objects/classes'
import type { ObjectEntry } from '@/lib/objects/library'
import type { Scoped } from '@/lib/objects/scoped'
import { cn } from '@/lib/utils'

const NONE = '\u0000none'

/** Every object of the scope is on the board, so its pages are all read. */
function useEveryPage(source: Scoped) {
  const { hasMore, isFetchingMore, loadMore } = source
  useEffect(() => {
    if (hasMore && !isFetchingMore) loadMore()
  }, [hasMore, isFetchingMore, loadMore])
}

export function ObjectBoard({
  cls,
  field,
  entries,
  source,
  model,
  onOpen,
}: {
  cls: ObjectClass
  field: FieldSpec
  entries: ObjectEntry[]
  source: Scoped
  model: Parameters<typeof FieldDisplay>[0]['model']
  onOpen: (entry: ObjectEntry, beside: boolean) => void
}) {
  useEveryPage(source)
  const update = useUpdateRecord(cls.type)
  // A card moved shows in its new column until the list reads it back.
  const [moved, setMoved] = useState<Record<string, string | null>>({})
  const variants =
    field.field_type.kind === 'enum' ? field.field_type.variants : []
  const valueOf = (entry: ObjectEntry): string => {
    const value =
      entry.ref in moved
        ? moved[entry.ref]
        : (entry.record?.values[field.key] as string | null | undefined)
    return typeof value === 'string' && variants.includes(value) ? value : NONE
  }
  const columns = [...variants, NONE]
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )
  const title = (id: unknown) =>
    entries.find((e) => e.ref === id)?.title ?? 'Object'
  const columnName = (id: unknown) =>
    id === NONE ? `No ${field.label.toLowerCase()}` : String(id)
  const drop = ({ active, over }: DragEndEvent) => {
    if (!over) return
    const entry = entries.find((e) => e.ref === active.id)
    const to = over.id === NONE ? null : String(over.id)
    if (!entry?.record || valueOf(entry) === (to ?? NONE)) return
    setMoved((m) => ({ ...m, [entry.ref]: to }))
    update.mutate(
      { id: entry.record.id, patch: { [field.key]: to } },
      {
        onError: () =>
          setMoved((m) => {
            const { [entry.ref]: _, ...rest } = m
            return rest
          }),
      },
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {update.error && (
        <p role="alert" className="text-sm wrap-anywhere text-error-ink">
          {describeError(update.error)}
        </p>
      )}
      <DndContext
        sensors={sensors}
        onDragEnd={drop}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up ${title(active.id)}.`,
            onDragOver: ({ active, over }) =>
              over
                ? `${title(active.id)} is over ${columnName(over.id)}.`
                : `${title(active.id)} is over no column.`,
            onDragEnd: ({ active, over }) =>
              over
                ? `${title(active.id)} moved to ${columnName(over.id)}.`
                : `${title(active.id)} was put back.`,
            onDragCancel: ({ active }) => `${title(active.id)} was put back.`,
          },
        }}
      >
        <div
          role="list"
          aria-label={`${cls.plural} by ${field.label.toLowerCase()}`}
          className="flex gap-3 overflow-x-auto pb-2"
        >
          {columns.map((column) => {
            const cards = entries.filter((e) => valueOf(e) === column)
            if (column === NONE && !cards.length) return null
            return (
              <Column
                key={column}
                id={column}
                name={columnName(column)}
                count={cards.length}
              >
                {cards.map((entry) => (
                  <BoardCard
                    key={entry.ref}
                    entry={entry}
                    group={field.key}
                    model={model}
                    onOpen={(beside) => onOpen(entry, beside)}
                  />
                ))}
              </Column>
            )
          })}
        </div>
      </DndContext>
    </div>
  )
}

function Column({
  id,
  name,
  count,
  children,
}: {
  id: string
  name: string
  count: number
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section
      ref={setNodeRef}
      role="listitem"
      aria-label={name}
      className={cn(
        'flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-frame p-2 transition-colors',
        isOver && 'bg-hover',
      )}
    >
      <h3 className="flex items-center gap-2 px-1 text-xs font-medium text-ink-muted">
        <span className="truncate">{name}</span>
        <span className="text-ink-faint tabular-nums">{count}</span>
      </h3>
      <ul className="flex min-h-12 flex-col gap-2">{children}</ul>
    </section>
  )
}

function BoardCard({
  entry,
  group,
  model,
  onOpen,
}: {
  entry: ObjectEntry
  group: string
  model: Parameters<typeof FieldDisplay>[0]['model']
  onOpen: (beside: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: entry.ref, disabled: !entry.record })
  const chosen = notesExtension(entry.cls.type).cardFields ?? []
  const fields = entry.cls.type.fields.filter(
    (f) =>
      chosen.includes(f.key) &&
      f.key !== group &&
      !isEmptyValue(entry.record?.values[f.key]),
  )
  return (
    <li
      ref={setNodeRef}
      style={
        transform
          ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
          : undefined
      }
      className={cn(
        'relative flex flex-col gap-1.5 rounded-md border border-separator bg-(--notes-pane) p-2.5 shadow-sm',
        isDragging && 'z-10 shadow-md',
      )}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-roledescription="card"
        onClick={(event) => onOpen(event.metaKey || event.ctrlKey)}
        className="text-start text-sm font-medium wrap-anywhere outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:outline-2 focus-visible:after:outline-focus"
      >
        {entry.title}
      </button>
      {fields.length > 0 && entry.record && (
        <dl className="flex flex-col gap-1 text-xs">
          {fields.map((f) => (
            <div key={f.key} className="flex min-w-0 gap-2">
              <dt className="shrink-0 text-ink-faint">{f.label}</dt>
              <dd className="min-w-0 truncate">
                <FieldDisplay
                  row={entry.record!}
                  field={f}
                  hint={displayHint(entry.cls.type, f.key)}
                  model={model}
                />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}
