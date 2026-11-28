// SOURCING: after Craft web's All Docs (Mobbin f707841e-dcd8-4c1d-82cb-e69a6d232e48: a large title with a round + before it, the gallery, compact and list toggle at the top right, page-thumbnail cards with the title and where the page lives under it) and its list view (174b04f5-d5cc-4d0a-97a1-6bf8417c3407: name with thumbnail and excerpt, then columns); coss Menu for sort and views; field-form's Segmented (coss segmented control) for the layout toggle; NoteExcerpt for a page's thumbnail and FieldDisplay (records/fields) for a record's; the saved views are Theorem's DataViews (lib/objects/views)
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject, ReactNode } from 'react'
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/coss/menu'
import { ArtifactView } from '@/components/artifacts/artifact-renderers'
import { useDocumentArtifact } from '@/components/artifacts/saved-artifact'
import { Icon } from '@/components/icons'
import { NoteExcerpt } from '@/components/notes/note-excerpt'
import { FieldDisplay } from '@/components/records/fields'
import { Segmented } from '@/components/records/field-form'
import { displayHint, isEmptyValue } from '@/components/records/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { describeError } from '@/lib/theorem/client'
import { useNote } from '@/lib/theorem/notes'
import type { ObjectClass } from '@/lib/objects/classes'
import { notesExtension } from '@/lib/objects/classes'
import { useCollections } from '@/lib/objects/collections'
import type { ObjectEntry } from '@/lib/objects/library'
import { ORIGIN_SHORT } from '@/lib/objects/library'
import { useClassRegistry } from '@/lib/objects/register'
import {
  useClassObjects,
  useCollectionObjects,
  useEveryObject,
} from '@/lib/objects/scoped'
import type { Scoped } from '@/lib/objects/scoped'
import {
  defaultLibraryQuery,
  useSaveView,
  useSavedViews,
} from '@/lib/objects/views'
import type { LibraryQuery } from '@/lib/objects/views'
import { cn } from '@/lib/utils'
import { ClassIcon } from './class-icon'
import { openPane, useNewObject, useOpenObject } from './object-actions'

const SORTS: { value: LibraryQuery['sort']; label: string }[] = [
  { value: 'updated', label: 'Last updated' },
  { value: 'created', label: 'Created' },
  { value: 'title', label: 'Title' },
]

const compare: Record<
  LibraryQuery['sort'],
  (a: ObjectEntry, b: ObjectEntry) => number
> = {
  updated: (a, b) => (b.updated ?? -1) - (a.updated ?? -1),
  created: (a, b) => (b.created ?? -1) - (a.created ?? -1),
  title: (a, b) => a.title.localeCompare(b.title),
}

/** The fields a class's card shows: its own choice, else the first few that are not its name. */
/** The fields a card or row shows: the class's choice, else its first three (or all, with `every`, for a caller that picks among them). */
export function cardFields(cls: ObjectClass, every = false) {
  const chosen = notesExtension(cls.type).cardFields
  const fields = cls.type.fields.filter(
    (field) => field.key !== cls.type.label_identifier_field && !field.system,
  )
  if (chosen)
    return chosen.flatMap((key) => fields.filter((field) => field.key === key))
  return every ? fields : fields.slice(0, 3)
}

/**
 * A library of objects in a pane: everything, one class, or one collection.
 * The scope is the pane's key; the filter, sort and layout can be saved as
 * a view and opened again from the Views menu.
 */
export function ObjectLibrary({ scope: initialScope }: { scope: string }) {
  const { registry, model } = useClassRegistry()
  const collections = useCollections(registry)
  const views = useSavedViews()
  const save = useSaveView()
  const [query, setQuery] = useState<LibraryQuery>(() =>
    defaultLibraryQuery(initialScope),
  )
  const set = (patch: Partial<LibraryQuery>) =>
    setQuery((q) => ({ ...q, ...patch }))
  const open = useOpenObject()

  const [kind, id] = splitScope(query.scope)
  const cls = kind === 'class' ? registry.byId.get(id) : undefined
  const collection =
    kind === 'collection'
      ? collections.collections.find((c) => c.id === id)
      : undefined
  const make = useNewObject(cls ?? registry.native.page)
  const scroller = useRef<HTMLElement>(null)

  // Each scope asks its owner, a page at a time.
  const byClass = useClassObjects(registry, cls, query.search, query.sort)
  const every = useEveryObject(
    registry,
    query.search,
    query.sort,
    kind === 'all',
  )
  const inCollection = useCollectionObjects(registry, collection)
  const source: Scoped =
    kind === 'class' ? byClass : kind === 'collection' ? inCollection : every
  const scoped = source.entries

  const present = useMemo(() => {
    const seen = new Map<string, ObjectClass>()
    for (const entry of scoped) seen.set(entry.cls.id, entry.cls)
    return [...seen.values()]
  }, [scoped])

  const shown = useMemo(() => {
    // Owners search their own objects; a collection's members are already at hand.
    const needle = collection ? query.search.trim().toLowerCase() : ''
    // A class's records arrive in the order Theorem sorted them.
    const ordered = cls && !cls.native
    return scoped
      .filter(
        (entry) =>
          !query.classes.length || query.classes.includes(entry.cls.id),
      )
      .filter((entry) => !needle || entry.title.toLowerCase().includes(needle))
      .sort(
        ordered || (collection && query.sort === 'updated')
          ? () => 0
          : compare[query.sort],
      )
  }, [scoped, query, collection, cls])

  const title = cls?.plural ?? collection?.name ?? 'All objects'
  const mark = cls ?? (collection && registry.collection) ?? undefined

  return (
    <section
      ref={scroller}
      aria-label={title}
      className="flex h-full min-h-0 flex-col overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-8 pt-16 pb-12">
        <header className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            aria-label={cls ? `New ${cls.label.toLowerCase()}` : 'New page'}
            disabled={make.isPending || (!cls && !registry.native.page)}
            onClick={() => make.make()}
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-separator text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
          >
            <Icon.Add className="size-4" />
          </button>
          {mark && <ClassIcon cls={mark} size="lg" />}
          <h1 className="flex min-w-0 flex-1 items-baseline gap-3 font-heading text-3xl font-semibold tracking-tight">
            <span className="truncate">{title}</span>
            {source.total !== undefined && (
              <span className="font-sans text-sm font-normal tracking-normal text-ink-faint tabular-nums">
                {source.total}
              </span>
            )}
          </h1>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              openPane({
                kind: 'graph',
                key: kind === 'all' ? 'global' : query.scope,
              })
            }
          >
            <Icon.Graph aria-hidden className="size-4" />
            Graph
          </Button>
          <ViewsMenu
            views={views.data ?? []}
            onApply={(view) => setQuery(view)}
            onSave={(name) => save.mutate({ title: name, query })}
            saving={save.isPending}
          />
          <SortMenu value={query.sort} onChange={(sort) => set({ sort })} />
          <Segmented
            label="Layout"
            value={query.layout}
            onChange={(layout) => set({ layout })}
            options={[
              { value: 'gallery', label: 'Gallery' },
              { value: 'list', label: 'List' },
            ]}
          />
        </header>
        {collection?.description && (
          <p className="-mt-2 max-w-prose text-sm text-ink-muted">
            {collection.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            aria-label={`Search ${title.toLowerCase()}`}
            placeholder="Search"
            value={query.search}
            onChange={(event) => set({ search: event.target.value })}
            className="w-56"
          />
          {!cls && present.length > 1 && (
            <div
              role="group"
              aria-label="Classes"
              className="flex flex-wrap gap-1"
            >
              {present.map((c) => {
                const on = query.classes.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set({
                        classes: on
                          ? query.classes.filter((x) => x !== c.id)
                          : [...query.classes, c.id],
                      })
                    }
                    className={cn(
                      'flex h-7 items-center gap-1.5 rounded-full border border-separator ps-1 pe-2.5 text-xs outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus',
                      on && 'bg-pill shadow-pill',
                    )}
                  >
                    <ClassIcon cls={c} />
                    {c.plural}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {(save.error ?? views.error ?? make.error) && (
          <p role="alert" className="text-sm wrap-anywhere text-error-ink">
            {describeError(save.error ?? views.error ?? make.error)}
          </p>
        )}
        {source.error != null && !shown.length ? (
          <p role="alert" className="text-sm wrap-anywhere text-error-ink">
            {describeError(source.error, 'document')}
          </p>
        ) : source.isPending && !shown.length ? (
          <p role="status" className="text-sm text-ink-faint">
            Loading…
          </p>
        ) : !shown.length ? (
          <p className="text-sm text-ink-faint">
            {query.search || query.classes.length
              ? 'Nothing matches.'
              : collection
                ? 'Nothing in this collection yet.'
                : `No ${title.toLowerCase()} yet.`}
          </p>
        ) : query.layout === 'gallery' ? (
          <ObjectGallery
            entries={shown}
            source={source}
            scroller={scroller}
            model={model.data}
            onOpen={(entry, beside) => open(entry, beside)}
          />
        ) : (
          <ObjectTable
            entries={shown}
            source={source}
            scroller={scroller}
            single={cls}
            model={model.data}
            onOpen={(entry, beside) => open(entry, beside)}
          />
        )}
        {source.error != null && shown.length > 0 && (
          <p role="alert" className="text-sm wrap-anywhere text-error-ink">
            {describeError(source.error, 'document')}
          </p>
        )}
      </div>
    </section>
  )
}

const splitScope = (
  scope: string,
): ['all' | 'class' | 'collection', string] => {
  const at = scope.indexOf(':')
  if (at < 0) return ['all', '']
  const kind = scope.slice(0, at)
  return [
    kind === 'class' || kind === 'collection' ? kind : 'all',
    scope.slice(at + 1),
  ]
}

const openClick =
  (onOpen: (beside: boolean) => void) => (event: React.MouseEvent) =>
    onOpen(event.metaKey || event.ctrlKey)

/** One object as a page thumbnail, its title and class under it. */
function ObjectCard({
  entry,
  model,
  onOpen,
}: {
  entry: ObjectEntry
  model: Parameters<typeof FieldDisplay>[0]['model']
  onOpen: (beside: boolean) => void
}) {
  // The thumbnail can hold a live artifact with controls of its own, so the
  // open control lies over the whole card rather than around it.
  return (
    <div className="group relative flex w-full flex-col gap-2 rounded-lg text-start has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-focus">
      <div
        inert
        className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-separator bg-(--notes-pane) shadow-sm transition-shadow duration-150 group-hover:shadow-md"
      >
        <Thumbnail entry={entry} model={model} />
      </div>
      <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <span className="truncate text-sm font-medium">{entry.title}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-faint">
          <ClassIcon cls={entry.cls} className="size-3.5 [&_svg]:size-2.5" />
          <span className="truncate">
            {entry.cls.label}
            {entry.origin === 'encoded' ? ' · encoded by an agent' : ''}
          </span>
        </span>
      </span>
      <button
        type="button"
        aria-label={entry.title}
        onClick={openClick(onOpen)}
        className="absolute inset-0 rounded-lg outline-none"
      />
    </div>
  )
}

function Thumbnail({
  entry,
  model,
}: {
  entry: ObjectEntry
  model: Parameters<typeof FieldDisplay>[0]['model']
}) {
  if (entry.documentId && entry.cls.native === 'page')
    return <PageThumbnail documentId={entry.documentId} />
  if (entry.documentId)
    return <ArtifactThumbnail documentId={entry.documentId} />
  if (entry.record) {
    const values = entry.record.values
    const chosen = notesExtension(entry.cls.type).cardFields
    const filled = cardFields(entry.cls, true).filter(
      (field) => !isEmptyValue(values[field.key]),
    )
    const fields = chosen ? filled : filled.slice(0, 3)
    // A record whose class declares nothing to show is read by its longest text, as a page is by its first lines.
    const excerpt = fields.length
      ? undefined
      : Object.values(values)
          .filter(
            (v): v is string =>
              typeof v === 'string' &&
              (v !== entry.title || v.length > 48) &&
              /\s/.test(v),
          )
          .sort((a, b) => b.length - a.length)[0]
    return (
      <div className="flex h-full flex-col gap-2 p-3.5">
        <ClassIcon cls={entry.cls} size="md" />
        {excerpt && (
          <p className="line-clamp-5 text-xs leading-5 text-ink-muted">
            {excerpt}
          </p>
        )}
        <dl className="flex min-h-0 flex-col gap-1.5 text-xs">
          {fields.map((field) => (
            <div key={field.key} className="flex min-w-0 flex-col">
              <dt className="text-ink-faint">{field.label}</dt>
              <dd className="min-w-0 truncate">
                <FieldDisplay
                  row={entry.record!}
                  field={field}
                  hint={displayHint(entry.cls.type, field.key)}
                  model={model}
                />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    )
  }
  return (
    <div className="flex h-full items-center justify-center">
      <ClassIcon cls={entry.cls} size="lg" />
    </div>
  )
}

/** A saved artifact as its own renderer previews it, as a reply does. */
function ArtifactThumbnail({ documentId }: { documentId: string }) {
  const { artifact, error } = useDocumentArtifact(documentId)
  if (error)
    return <p className="truncate p-3 text-xs text-error-ink">{error}</p>
  if (!artifact) return null
  return (
    <div className="pointer-events-none h-full origin-top-left scale-[0.5] [width:200%]">
      <ArtifactView artifact={artifact} distance="preview" latest />
    </div>
  )
}

/** A page's first lines, small, as Craft's thumbnails show the page. */
function PageThumbnail({ documentId }: { documentId: string }) {
  const note = useNote(documentId).data
  return note?.markdown ? (
    <div
      aria-hidden="true"
      className="pointer-events-none h-full origin-top-left scale-[0.62] p-4 [width:161%]"
    >
      <NoteExcerpt markdown={note.markdown.slice(0, 900)} />
    </div>
  ) : null
}

/** The width of `ref`'s box and where it starts in the scroller, kept as either changes. */
const FIRST_RECT = { width: 0, height: 900 }

function useBox(
  ref: RefObject<HTMLElement | null>,
  scroller: RefObject<HTMLElement | null>,
) {
  const [box, setBox] = useState({ width: 0, top: 0 })
  useEffect(() => {
    const node = ref.current
    const outer = scroller.current
    if (!node || !outer) return
    const measure = () =>
      setBox({
        width: node.clientWidth,
        top:
          node.getBoundingClientRect().top -
          outer.getBoundingClientRect().top +
          outer.scrollTop,
      })
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    if (node.parentElement) observer.observe(node.parentElement)
    return () => observer.disconnect()
  }, [ref, scroller])
  return box
}

/** Ask the owner for the next page as the end comes into view. */
function useLoadAtEnd(lastIndex: number, count: number, source: Scoped) {
  const { hasMore, isFetchingMore, loadMore } = source
  useEffect(() => {
    if (count && lastIndex >= count - 3 && hasMore && !isFetchingMore)
      loadMore()
  }, [lastIndex, count, hasMore, isFetchingMore, loadMore])
}

const CARD_MIN = 208
const CARD_GAP_X = 20
const CARD_ROW = 248

function ObjectGallery({
  entries,
  source,
  scroller,
  model,
  onOpen,
}: {
  entries: ObjectEntry[]
  source: Scoped
  scroller: RefObject<HTMLElement | null>
  model: Parameters<typeof FieldDisplay>[0]['model']
  onOpen: (entry: ObjectEntry, beside: boolean) => void
}) {
  const grid = useRef<HTMLDivElement>(null)
  const box = useBox(grid, scroller)
  const columns = Math.max(
    1,
    Math.floor((box.width + CARD_GAP_X) / (CARD_MIN + CARD_GAP_X)),
  )
  const rows = Math.ceil(entries.length / columns)
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scroller.current,
    estimateSize: () => CARD_ROW,
    // A screen's worth before the scroller is measured, so the first frame is not empty.
    initialRect: FIRST_RECT,
    scrollMargin: box.top,
    overscan: 3,
  })
  const items = virtualizer.getVirtualItems()
  useLoadAtEnd(items.at(-1)?.index ?? 0, rows, source)
  return (
    <div
      ref={grid}
      role="list"
      aria-label="Objects"
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {items.map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="absolute inset-x-0 top-0 grid gap-x-5 pb-7"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
          }}
        >
          {entries
            .slice(row.index * columns, row.index * columns + columns)
            .map((entry) => (
              <div role="listitem" key={entry.ref}>
                <ObjectCard
                  entry={entry}
                  model={model}
                  onOpen={(beside) => onOpen(entry, beside)}
                />
              </div>
            ))}
        </div>
      ))}
    </div>
  )
}

const TABLE_ROW = 37

function ObjectTable({
  entries,
  source,
  scroller,
  single,
  model,
  onOpen,
}: {
  entries: ObjectEntry[]
  source: Scoped
  scroller: RefObject<HTMLElement | null>
  /** The class every row belongs to, when the library is one class: its fields become columns. */
  single?: ObjectClass
  model: Parameters<typeof FieldDisplay>[0]['model']
  onOpen: (entry: ObjectEntry, beside: boolean) => void
}) {
  const columns = single && !single.native ? cardFields(single) : []
  const body = useRef<HTMLTableElement>(null)
  const box = useBox(body, scroller)
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => TABLE_ROW,
    // A screen's worth before the scroller is measured, so the first frame is not empty.
    initialRect: FIRST_RECT,
    scrollMargin: box.top,
    overscan: 12,
  })
  const items = virtualizer.getVirtualItems()
  useLoadAtEnd(items.at(-1)?.index ?? 0, entries.length, source)
  const before = (items[0]?.start ?? box.top) - box.top
  const after =
    virtualizer.getTotalSize() - ((items.at(-1)?.end ?? box.top) - box.top)
  const span = columns.length + (single ? 2 : 3)
  return (
    <table
      ref={body}
      className="w-full table-fixed border-separate border-spacing-0 text-sm"
    >
      <thead>
        <tr className="text-start text-xs text-ink-faint">
          <Th className="w-[45%]">Name</Th>
          {single ? null : <Th>Class</Th>}
          {columns.map((field) => (
            <Th key={field.key}>{field.label}</Th>
          ))}
          <Th>Origin</Th>
        </tr>
      </thead>
      <tbody>
        {before > 0 && (
          <tr aria-hidden="true">
            <td colSpan={span} style={{ height: before }} />
          </tr>
        )}
        {items.map((item) => {
          const entry = entries[item.index]!
          return (
            <tr
              key={entry.ref}
              data-index={item.index}
              ref={virtualizer.measureElement}
              tabIndex={0}
              onClick={(event) => onOpen(entry, event.metaKey || event.ctrlKey)}
              onKeyDown={(event) => {
                if (event.key === 'Enter')
                  onOpen(entry, event.metaKey || event.ctrlKey)
              }}
              className="cursor-default outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            >
              <Td>
                <span className="flex min-w-0 items-center gap-2">
                  <ClassIcon cls={entry.cls} />
                  <span className="truncate font-medium">{entry.title}</span>
                </span>
              </Td>
              {single ? null : (
                <Td className="text-ink-muted">{entry.cls.label}</Td>
              )}
              {columns.map((field) => (
                <Td key={field.key}>
                  {entry.record && (
                    <FieldDisplay
                      row={entry.record}
                      field={field}
                      hint={displayHint(single!.type, field.key)}
                      model={model}
                    />
                  )}
                </Td>
              ))}
              <Td className="text-ink-muted">{ORIGIN_SHORT[entry.origin]}</Td>
            </tr>
          )
        })}
        {after > 0 && (
          <tr aria-hidden="true">
            <td colSpan={span} style={{ height: after }} />
          </tr>
        )}
      </tbody>
    </table>
  )
}

const Th = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => (
  <th
    className={cn(
      'border-b border-separator px-2 py-1.5 text-start font-normal',
      className,
    )}
  >
    {children}
  </th>
)
const Td = ({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) => (
  <td className={cn('truncate border-b border-separator px-2 py-2', className)}>
    {children}
  </td>
)

function SortMenu({
  value,
  onChange,
}: {
  value: LibraryQuery['sort']
  onChange: (v: LibraryQuery['sort']) => void
}) {
  return (
    <Menu>
      <MenuTrigger
        render={<Button size="sm" variant="ghost" aria-label="Sort" />}
      >
        <Icon.Sort aria-hidden className="size-4" />
        {SORTS.find((s) => s.value === value)?.label}
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as LibraryQuery['sort'])}
        >
          {SORTS.map((sort) => (
            <MenuRadioItem key={sort.value} value={sort.value}>
              {sort.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  )
}

function ViewsMenu({
  views,
  onApply,
  onSave,
  saving,
}: {
  views: { id: string; title: string; query: LibraryQuery }[]
  onApply: (query: LibraryQuery) => void
  onSave: (name: string) => void
  saving: boolean
}) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  return naming ? (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim()) return
        onSave(name.trim())
        setNaming(false)
        setName('')
      }}
    >
      <Input
        autoFocus
        aria-label="View name"
        placeholder="View name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && setNaming(false)}
        className="h-8 w-40"
      />
      <Button size="sm" type="submit" disabled={saving || !name.trim()}>
        Save
      </Button>
    </form>
  ) : (
    <Menu>
      <MenuTrigger render={<Button size="sm" variant="ghost" />}>
        <Icon.Layout aria-hidden className="size-4" />
        Views
      </MenuTrigger>
      <MenuPopup align="end" className="min-w-52">
        {views.length > 0 && (
          <MenuGroup>
            <MenuGroupLabel>Saved views</MenuGroupLabel>
            {views.map((view) => (
              <MenuItem key={view.id} onClick={() => onApply(view.query)}>
                {view.title}
              </MenuItem>
            ))}
          </MenuGroup>
        )}
        {views.length > 0 && <MenuSeparator />}
        <MenuItem onClick={() => setNaming(true)}>Save this view…</MenuItem>
      </MenuPopup>
    </Menu>
  )
}
