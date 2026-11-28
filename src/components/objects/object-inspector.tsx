// SOURCING: after Craft web's right-hand document panel (Mobbin fe902442-73f0-4633-bbd6-84b521fe9b9d: tabbed Insert, Format, Style and Info beside the page) with Capacities' object properties and backlinks as its content; coss Tabs; zustand persist (whether the inspector is open on this device); records/fields FieldDisplay and FieldEditorPopover with useUpdateRecord for a record's properties; crm/api readRecordChanges and crm/model actorName for a record's history; lib/objects collections and connections for membership and relationships
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/coss/tabs'
import { readRecordChanges } from '@/components/crm/api'
import { actorName } from '@/components/crm/model'
import { originText } from '@/components/crm/proposal'
import { useLifeContext } from '@/components/crm/queries'
import { Icon } from '@/components/icons'
import {
  FieldDisplay,
  FieldEditorPopover,
  isEditable,
} from '@/components/records/fields'
import type { FieldSpec } from '@/components/records/contract'
import { displayHint, parseRecordItemId } from '@/components/records/model'
import { useUpdateRecord } from '@/components/records/queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { describeError } from '@/lib/theorem/client'
import type { Note } from '@/lib/theorem/notes'
import { useCollections } from '@/lib/objects/collections'
import type { Collections } from '@/lib/objects/collections'
import { connectionsAt } from '@/lib/objects/connections'
import type { Connection } from '@/lib/objects/connections'
import { useObjectEntry, useObjectGraph } from '@/lib/objects/graph'
import { recordEntry } from '@/lib/objects/scoped'
import type { ObjectEntry } from '@/lib/objects/library'
import { ORIGIN_LONG } from '@/lib/objects/library'
import { useClassRegistry } from '@/lib/objects/register'
import { operationsOf } from '@/lib/objects/operations'
import { cn } from '@/lib/utils'
import { ClassIcon } from './class-icon'
import { openPane, useOpenObject } from './object-actions'
import { ObjectActions, OperationReceipts } from './object-operations'

export const useInspector = create<{ open: boolean; toggle: () => void }>()(
  persist(
    (set) => ({ open: true, toggle: () => set((s) => ({ open: !s.open })) }),
    { name: 'theorem-ui:notes-inspector' },
  ),
)

/** The page text Notes has already read, by document id; no read is made for it. */
export function useLoadedMarkdown() {
  const client = useQueryClient()
  const notes = client.getQueriesData<Note>({ queryKey: ['theorem', 'note'] })
  const key = notes.map(([, note]) => note?.revision ?? '').join('|')
  const [held, setHeld] = useState({ key, notes })
  // A new revision anywhere replaces what was read; the same ones keep the map.
  if (held.key !== key) setHeld({ key, notes })
  return useMemo(
    () =>
      new Map(
        held.notes.flatMap(([, note]) =>
          note ? [[note.documentId, note.markdown] as const] : [],
        ),
      ),
    [held],
  )
}

/** Everything known about one object, beside its page. */
export function ObjectInspector({ objectRef }: { objectRef: string }) {
  const { registry, model } = useClassRegistry()
  const collections = useCollections(registry)
  const markdown = useLoadedMarkdown()
  const one = useObjectEntry(registry, objectRef)
  const entry = one.entry
  const seeds = useLocalSeeds(entry, collections, registry)
  const graph = useObjectGraph({
    registry,
    seeds,
    depth: 1,
    collections: collections.collections,
    markdown,
    local: true,
  })
  if (!entry)
    return (
      <InspectorFrame>
        {one.error ? (
          <p role="alert" className="truncate px-4 py-3 text-sm text-error-ink">
            {describeError(one.error, 'document')}
          </p>
        ) : (
          <p role="status" className="px-4 py-3 text-sm text-ink-faint">
            {one.isPending ? 'Loading…' : 'Not found.'}
          </p>
        )}
      </InspectorFrame>
    )
  return (
    <InspectorFrame>
      <div className="flex items-center gap-2 px-4 pt-12 pb-2">
        <ClassIcon cls={entry.cls} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entry.title}</p>
          <p className="truncate text-xs text-ink-faint">{entry.cls.label}</p>
        </div>
        <FavoriteToggle entry={entry} collections={collections} />
      </div>
      <Tabs defaultValue="properties" className="min-h-0 flex-1">
        <TabsList variant="underline" className="px-2">
          <TabsTab value="properties">Properties</TabsTab>
          <TabsTab value="connections">Connections</TabsTab>
          <TabsTab value="history">History</TabsTab>
        </TabsList>
        <TabsPanel
          value="properties"
          className="flex min-h-0 flex-col gap-5 overflow-y-auto px-2 py-3"
        >
          <Properties entry={entry} model={model.data} />
          {operationsOf(entry.cls.type).length > 0 && (
            <Section title="Actions">
              <ObjectActions entry={entry} />
            </Section>
          )}
          <Section title="Collections">
            <CollectionsList entry={entry} collections={collections} />
          </Section>
          <Section title="Origin">
            <Origin entry={entry} />
          </Section>
        </TabsPanel>
        <TabsPanel
          value="connections"
          className="flex min-h-0 flex-col gap-4 overflow-y-auto px-2 py-3"
        >
          <Connections
            entry={entry}
            entries={graph.entries}
            connections={graph.connections}
            error={graph.error}
          />
        </TabsPanel>
        <TabsPanel
          value="history"
          className="flex min-h-0 flex-col gap-4 overflow-y-auto px-2 py-3"
        >
          <OperationReceipts entry={entry} />
          <History entry={entry} />
        </TabsPanel>
      </Tabs>
    </InspectorFrame>
  )
}

/**
 * What a local graph starts from: the object, and the collections that hold
 * it, so membership is drawn without reading every object.
 */
export function useLocalSeeds(
  entry: ObjectEntry | undefined,
  collections: Collections,
  registry: ReturnType<typeof useClassRegistry>['registry'],
) {
  const holders = entry ? collections.of(entry.ref) : []
  const key = holders.map((c) => c.id).join('|')
  return useMemo(
    () => {
      if (!entry) return []
      const cls = registry.collection
      return [
        entry,
        ...(cls ? holders.map((c) => recordEntry(cls, c.row)) : []),
      ]
    },
    // The holders are named by `key`; the array itself is new each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, key, registry],
  )
}

const InspectorFrame = ({ children }: { children: ReactNode }) => (
  <aside
    aria-label="Inspector"
    className="flex h-full w-80 shrink-0 flex-col overflow-hidden border-s border-separator bg-(--notes-pane)"
  >
    {children}
  </aside>
)

const Section = ({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) => (
  <section className="flex flex-col gap-1">
    <div className="flex h-6 items-center px-2">
      <h3 className="flex-1 text-xs font-medium text-ink-faint">{title}</h3>
      {action}
    </div>
    {children}
  </section>
)

const rowClass = 'flex min-h-7 items-center gap-2 rounded-md px-2 text-sm'

function Properties({
  entry,
  model,
}: {
  entry: ObjectEntry
  model: Parameters<typeof FieldDisplay>[0]['model']
}) {
  if (!entry.record)
    return (
      <Section title="Properties">
        <dl className="flex flex-col">
          <Prop label="Class">{entry.cls.label}</Prop>
          <Prop label="Title">{entry.title}</Prop>
        </dl>
      </Section>
    )
  return (
    <Section title="Properties">
      <RecordProperties
        entry={
          entry as ObjectEntry & { record: NonNullable<ObjectEntry['record']> }
        }
        model={model}
      />
    </Section>
  )
}

const Prop = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className={rowClass}>
    <dt className="w-24 shrink-0 truncate text-ink-muted">{label}</dt>
    <dd className="min-w-0 flex-1 truncate">{children}</dd>
  </div>
)

/** A record's fields, each edited in place through the register's own field editors. */
export function RecordProperties({
  entry,
  model,
  fields,
}: {
  entry: ObjectEntry & { record: NonNullable<ObjectEntry['record']> }
  model: Parameters<typeof FieldDisplay>[0]['model']
  fields?: FieldSpec[]
}) {
  const type = entry.cls.type
  const update = useUpdateRecord(type)
  const client = useQueryClient()
  const [editing, setEditing] = useState<{
    key: string
    anchor: HTMLElement
  } | null>(null)
  const commit = (field: FieldSpec, value: unknown) => {
    setEditing(null)
    update.mutate(
      { id: entry.record.id, patch: { [field.key]: value } },
      {
        onSettled: () =>
          void client.invalidateQueries({
            queryKey: ['theorem', 'records', 'all'],
          }),
      },
    )
  }
  return (
    <>
      <dl className="flex flex-col">
        {(
          fields ??
          type.fields.filter(
            (f) =>
              !f.system ||
              (entry.record.values[f.key] !== undefined &&
                entry.record.values[f.key] !== null &&
                entry.record.values[f.key] !== ''),
          )
        ).map((field) => {
          const editable = isEditable(field)
          return (
            <div key={field.key} className={rowClass}>
              <dt className="w-24 shrink-0 truncate text-ink-muted">
                {field.label}
              </dt>
              <dd className="min-w-0 flex-1">
                <button
                  type="button"
                  disabled={!editable}
                  aria-label={`Edit ${field.label}`}
                  onClick={(event) =>
                    setEditing({ key: field.key, anchor: event.currentTarget })
                  }
                  className="flex min-h-7 w-full min-w-0 items-center truncate rounded-md px-1.5 text-start outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus disabled:hover:bg-transparent"
                >
                  <FieldDisplay
                    row={entry.record}
                    field={field}
                    hint={displayHint(type, field.key)}
                    model={model}
                    onToggle={(value) => commit(field, value)}
                  />
                </button>
                {editing?.key === field.key && (
                  <FieldEditorPopover
                    anchor={editing.anchor}
                    field={field}
                    hint={displayHint(type, field.key)}
                    value={entry.record.values[field.key]}
                    row={entry.record}
                    model={model}
                    onCommit={(value) => commit(field, value)}
                    onDiscard={() => setEditing(null)}
                  />
                )}
              </dd>
            </div>
          )
        })}
      </dl>
      {update.error && (
        <p role="alert" className="px-2 text-xs wrap-anywhere text-error-ink">
          {describeError(update.error)}
        </p>
      )}
    </>
  )
}

function FavoriteToggle({
  entry,
  collections,
}: {
  entry: ObjectEntry
  collections: Collections
}) {
  const [pending, setPending] = useState(false)
  if (!collections.available) return null
  const on = !!collections.favorites?.members.includes(entry.ref)
  return (
    <button
      type="button"
      aria-label={on ? 'Remove from Favorites' : 'Add to Favorites'}
      aria-pressed={on}
      disabled={pending}
      onClick={() => {
        setPending(true)
        void collections
          .toggleFavorite(entry.ref)
          .finally(() => setPending(false))
      }}
      className={cn(
        'flex size-7 items-center justify-center rounded-md outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus',
        on ? 'text-ochre-ink' : 'text-ink-faint',
      )}
    >
      <Icon.Star className={cn('size-4', on && '[&_path]:fill-current')} />
    </button>
  )
}

function CollectionsList({
  entry,
  collections,
}: {
  entry: ObjectEntry
  collections: Collections
}) {
  const [name, setName] = useState('')
  if (!collections.available)
    return (
      <p className="px-2 text-sm text-ink-faint">
        {collections.isPending ? 'Loading…' : 'Collections are being set up.'}
      </p>
    )
  return (
    <div className="flex flex-col">
      {collections.curated.map((collection) => {
        const member = collection.members.includes(entry.ref)
        return (
          <label key={collection.id} className={cn(rowClass, 'hover:bg-hover')}>
            <input
              type="checkbox"
              checked={member}
              onChange={() => void collections.toggle(collection, entry.ref)}
              className="size-3.5 accent-(--color-ink)"
            />
            <span className="min-w-0 flex-1 truncate">{collection.name}</span>
            <span className="text-xs text-ink-faint tabular-nums">
              {collection.members.length}
            </span>
          </label>
        )
      })}
      <form
        className="flex items-center gap-1 px-1 pt-1"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim())
            void collections
              .create(name.trim(), [entry.ref])
              .then(() => setName(''))
        }}
      >
        <Input
          aria-label="New collection"
          placeholder="New collection"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-7 text-sm"
        />
        <Button size="xs" type="submit" variant="ghost" disabled={!name.trim()}>
          Add
        </Button>
      </form>
      {collections.error && (
        <p
          role="alert"
          className="px-2 pt-1 text-xs wrap-anywhere text-error-ink"
        >
          {describeError(collections.error)}
        </p>
      )}
    </div>
  )
}

function Origin({ entry }: { entry: ObjectEntry }) {
  // A record says who made it in its first change; a page in its origin.
  const { changes, me } = useRecordHistory(entry)
  const created = changes.data?.find((change) => change.kind === 'created')
  const madeBy = created
    ? created.origin?.kind === 'conversation'
      ? 'Theorem, in your conversation'
      : created.origin?.kind === 'proposal'
        ? 'Theorem, approved by you'
        : actorName(created.actor, me)
    : ORIGIN_LONG[entry.origin]
  return (
    <dl className="flex flex-col">
      <Prop label="Made by">{madeBy}</Prop>
      {entry.encodedFrom && <Prop label="From">{entry.encodedFrom}</Prop>}
      {entry.cls.type.provider?.kind === 'connector' && (
        <Prop label="Held by">{entry.cls.type.provider.connector_id}</Prop>
      )}
      {entry.cls.type.provider?.kind === 'derived-program' && (
        <Prop label="Derived by">{entry.cls.type.provider.program_id}</Prop>
      )}
      {(entry.actors ?? []).map((actor, index) => (
        <Prop key={`${actor.actorId}:${index}`} label={actor.originSurface}>
          {actorName(actor.actorId)}
          {actor.runId ? ` · run ${actor.runId.slice(0, 8)}` : ''}
        </Prop>
      ))}
    </dl>
  )
}

export const KIND_TONE: Record<Connection['kind'], string> = {
  explicit: 'text-ink-muted',
  provenance: 'text-teal-ink',
  inferred: 'text-insight-ink',
}

export const KIND_LABEL: Record<Connection['kind'], string> = {
  explicit: 'Linked',
  provenance: 'Provenance',
  inferred: 'Inferred',
}

function Connections({
  entry,
  entries,
  connections,
  error,
}: {
  entry: ObjectEntry
  entries: ObjectEntry[]
  connections: Connection[]
  error: unknown
}) {
  const open = useOpenObject()
  const byRef = useMemo(
    () => new Map(entries.map((e) => [e.ref, e])),
    [entries],
  )
  // An end no class declares stays a plain row: the graph holds it, but
  // there is no object page to open.
  const derived = connectionsAt(connections, entry.ref)
  const rows = [
    ...derived.outgoing.map((c) => ({
      ref: c.to,
      label: c.label,
      kind: c.kind,
      confidence: c.confidence,
      direction: 'out' as const,
    })),
    ...derived.incoming.map((c) => ({
      ref: c.from,
      label: c.label,
      kind: c.kind,
      confidence: c.confidence,
      direction: 'in' as const,
    })),
  ]
  const groups = (['out', 'in'] as const).map((direction) => ({
    direction,
    rows: rows.filter((row) => row.direction === direction),
  }))
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="mx-2 self-start"
        onClick={() =>
          openPane({ kind: 'graph', key: `local:${entry.ref}` }, true)
        }
      >
        <Icon.Graph aria-hidden className="size-4" />
        Open in graph
      </Button>
      {groups.map(({ direction, rows: list }) => (
        <Section
          key={direction}
          title={direction === 'out' ? 'Points to' : 'Pointed to by'}
        >
          {list.length ? (
            <ul className="flex flex-col">
              {list.map((row, index) => {
                const other = byRef.get(row.ref)
                if (!other)
                  return (
                    <li
                      key={`${row.ref}:${row.label}:${index}`}
                      className={rowClass}
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-muted">
                        {row.ref}
                      </span>
                      <span
                        className={cn('shrink-0 text-xs', KIND_TONE[row.kind])}
                      >
                        {row.label}
                      </span>
                    </li>
                  )
                return (
                  <li key={`${row.ref}:${row.label}:${index}`}>
                    <button
                      type="button"
                      onClick={(event) =>
                        open(other, event.metaKey || event.ctrlKey)
                      }
                      className={cn(
                        rowClass,
                        'w-full text-start outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus',
                      )}
                    >
                      <ClassIcon cls={other.cls} />
                      <span className="min-w-0 flex-1 truncate">
                        {other.title}
                      </span>
                      <span
                        className={cn('shrink-0 text-xs', KIND_TONE[row.kind])}
                      >
                        {row.label}
                        <span className="sr-only">
                          , {KIND_LABEL[row.kind]}
                        </span>
                        {row.confidence !== undefined && row.confidence < 1
                          ? ` ${Math.round(row.confidence * 100)}%`
                          : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-2 text-sm text-ink-faint">None</p>
          )}
        </Section>
      ))}
      {error != null && (
        <p role="alert" className="truncate px-2 text-xs text-error-ink">
          {describeError(error)}
        </p>
      )}
    </>
  )
}

/** A record's saved changes, newest first, and who the signed-in person is. */
function useRecordHistory(entry: ObjectEntry) {
  const recordId = entry.record
    ? parseRecordItemId(entry.ref)?.recordId
    : undefined
  const changes = useQuery({
    queryKey: ['theorem', 'objects', 'history', recordId],
    queryFn: () => readRecordChanges(recordId!),
    enabled: !!recordId,
  })
  const me = useLifeContext().data?.actor
  return { recordId, changes, me }
}

function History({ entry }: { entry: ObjectEntry }) {
  const { recordId, changes, me } = useRecordHistory(entry)
  if (!recordId)
    return (
      <dl className="flex flex-col">
        <Prop label="Revision">
          {entry.documentId ? 'Saved in Documents' : '-'}
        </Prop>
        {(entry.actors ?? []).map((actor, index) => (
          <Prop
            key={`${actor.actorId}:${index}`}
            label={actorName(actor.actorId)}
          >
            {actor.originSurface}
          </Prop>
        ))}
      </dl>
    )
  if (changes.isPending)
    return <p className="px-2 text-sm text-ink-faint">Loading…</p>
  if (changes.error)
    return (
      <p role="alert" className="px-2 text-sm wrap-anywhere text-error-ink">
        {describeError(changes.error)}
      </p>
    )
  if (!changes.data.length)
    return <p className="px-2 text-sm text-ink-faint">No changes yet.</p>
  return (
    <ol className="flex flex-col gap-2 px-2">
      {changes.data.map((change) => (
        <li key={change.id} className="flex flex-col text-sm">
          <span>
            {actorName(change.actor, me)} {change.kind}
            {Object.keys(change.changed).length
              ? ` ${Object.keys(change.changed)
                  .map(
                    (key) =>
                      entry.cls.type.fields.find((f) => f.key === key)?.label ??
                      key,
                  )
                  .join(', ')}`
              : ''}
          </span>
          {change.origin && (
            <span className="text-xs text-ink-muted">
              {originText(change.origin)}{' '}
              <Link
                to="/c/$threadId"
                params={{ threadId: change.origin.threadId }}
                className="rounded-sm font-medium text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
              >
                See the conversation
              </Link>
            </span>
          )}
          <time
            className="text-xs text-ink-faint"
            dateTime={new Date(change.atMs).toISOString()}
          >
            {new Date(change.atMs).toLocaleString()}
          </time>
        </li>
      ))}
    </ol>
  )
}
