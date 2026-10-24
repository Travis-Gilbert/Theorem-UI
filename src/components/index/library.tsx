// SOURCING: @openuidev/react-lang (defineComponent, defineAction, createLibrary, reactive + useStateField, useTriggerAction, action) for the Index's component library; Base UI ToggleGroup (presentation and choice controls); zod/v4 prop schemas as OpenUI requires
import {
  action,
  createLibrary,
  defineAction,
  defineComponent,
  reactive,
  useStateField,
  useTriggerAction,
} from '@openuidev/react-lang'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { z } from 'zod/v4'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { AtlasMap } from './atlas'
import type {
  AtlasSnapshot,
  Collection,
  FilingReceipt,
  IndexItem,
  ObservationEvent,
  Scope,
} from './contract'

/** What a rendered view can reach outside its program. */
export type IndexHost = {
  scope: Scope
  viewId: string
  selectedId: string | undefined
  openItem: (documentId: string) => void
  openCollection: (collectionId: string) => void
  collectionName: (collectionId: string) => string | undefined
  record: (event: Omit<ObservationEvent, 'atMs' | 'scope' | 'viewId'>) => void
}

/** Previews render with a host that opens nothing and records nothing. */
export const PREVIEW_HOST: IndexHost = {
  scope: { kind: 'home' },
  viewId: 'preview',
  selectedId: undefined,
  openItem: () => undefined,
  openCollection: () => undefined,
  collectionName: () => undefined,
  record: () => undefined,
}

export const IndexHostContext = createContext<IndexHost>(PREVIEW_HOST)
const useHost = () => useContext(IndexHostContext)

const rows = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : []

// Layout and text

const Stack = defineComponent({
  name: 'Stack',
  description: 'Vertical stack of children; the usual root.',
  props: z.object({
    children: z.array(z.any()),
    gap: z.enum(['sm', 'md', 'lg']).optional(),
  }),
  component: ({ props, renderNode }) => (
    <div
      className={cn(
        'flex flex-col',
        props.gap === 'sm' ? 'gap-2' : props.gap === 'lg' ? 'gap-8' : 'gap-5',
      )}
    >
      {renderNode(props.children)}
    </div>
  ),
})

const Columns = defineComponent({
  name: 'Columns',
  description:
    'Children side by side in equal columns; they stack on a narrow screen.',
  props: z.object({ children: z.array(z.any()) }),
  component: ({ props, renderNode }) => (
    <div className="grid grid-cols-1 gap-5 md:auto-cols-fr md:grid-flow-col">
      {renderNode(props.children)}
    </div>
  ),
})

const Section = defineComponent({
  name: 'Section',
  description:
    'A titled group of children, with an optional one-line description.',
  props: z.object({
    title: z.string(),
    children: z.array(z.any()),
    description: z.string().optional(),
  }),
  component: ({ props, renderNode }) => (
    <section className="flex flex-col gap-2.5">
      <header className="flex flex-col gap-0.5">
        <h3 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
          {props.title}
        </h3>
        {props.description && (
          <p className="text-sm text-ink-muted">{props.description}</p>
        )}
      </header>
      {renderNode(props.children)}
    </section>
  ),
})

const Heading = defineComponent({
  name: 'Heading',
  description: 'A heading; level 1 is the largest.',
  props: z.object({
    text: z.string(),
    level: z.number().optional(),
  }),
  component: ({ props }) =>
    props.level === 1 ? (
      <h2 className="font-heading text-[22px] font-normal tracking-tight">
        {props.text}
      </h2>
    ) : (
      <h3 className="font-heading text-[17px] font-normal tracking-tight">
        {props.text}
      </h3>
    ),
})

const Text = defineComponent({
  name: 'Text',
  description: 'A paragraph of plain text.',
  props: z.object({
    text: z.string(),
    tone: z.enum(['default', 'muted']).optional(),
  }),
  component: ({ props }) => (
    <p
      className={cn(
        'text-sm leading-6',
        props.tone === 'muted' && 'text-ink-muted',
      )}
    >
      {props.text}
    </p>
  ),
})

const Callout = defineComponent({
  name: 'Callout',
  description:
    'A short notice: info for context, missing for something not there yet, warning for something to check.',
  props: z.object({
    text: z.string(),
    tone: z.enum(['info', 'missing', 'warning']),
  }),
  component: ({ props }) => (
    <p
      className={cn(
        'rounded-lg border px-3 py-2 text-sm',
        props.tone === 'warning'
          ? 'border-ochre/40 bg-ochre/8'
          : props.tone === 'missing'
            ? 'border-dashed border-separator text-ink-muted'
            : 'border-teal/30 bg-teal/6',
      )}
    >
      {props.text}
    </p>
  ),
})

const Metric = defineComponent({
  name: 'Metric',
  description: 'One labelled number or short value, e.g. @Count(found.items).',
  props: z.object({
    label: z.string(),
    value: z.union([z.number(), z.string()]),
  }),
  component: ({ props }) => (
    <div className="flex flex-col gap-0.5 rounded-lg border border-separator px-3 py-2">
      <span className="text-xs text-ink-faint">{props.label}</span>
      <span className="font-heading text-[22px] leading-tight tabular-nums">
        {props.value}
      </span>
    </div>
  ),
})

// Reactive inputs

function useDebounced(value: string, delayMs: number) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return settled
}

const SearchField = defineComponent({
  name: 'SearchField',
  description:
    'Exact search box bound to a $variable; pass the variable to a Query as {q: $q}.',
  props: z.object({
    placeholder: z.string(),
    value: reactive(z.string().optional()),
  }),
  component: function SearchFieldView({ props }) {
    const field = useStateField('value', props.value)
    const host = useHost()
    const [draft, setDraft] = useState(field.value ?? '')
    const settled = useDebounced(draft, 250)
    useEffect(() => {
      if (settled !== (field.value ?? '')) field.setValue(settled)
    }, [settled, field])
    // A search counts once it has rested, not per keystroke.
    const recorded = useDebounced(settled, 1200)
    const last = useRef('')
    useEffect(() => {
      const q = recorded.trim()
      if (!q || q === last.current) return
      last.current = q
      host.record({ kind: 'search_run', detail: { q } })
    }, [recorded, host])
    return (
      <Input
        type="search"
        aria-label={props.placeholder}
        placeholder={props.placeholder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    )
  },
})

const Choice = defineComponent({
  name: 'Choice',
  description:
    'Pick one of a few options, bound to a $variable; "" in options means any.',
  props: z.object({
    label: z.string(),
    options: z.array(z.string()),
    value: reactive(z.string().optional()),
  }),
  component: function ChoiceView({ props }) {
    const field = useStateField('value', props.value)
    const host = useHost()
    const current = field.value ?? ''
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-faint">{props.label}</span>
        <ToggleGroup
          value={[current]}
          onValueChange={(next) => {
            const value = String(next[0] ?? '')
            field.setValue(value)
            host.record({
              kind: 'filter_applied',
              detail: { filter: props.label, value },
            })
          }}
          className="flex flex-wrap gap-1"
        >
          {props.options.map((option) => (
            <Toggle key={option} value={option} className={chip}>
              {option === '' ? 'Any' : option.replaceAll('_', ' ')}
            </Toggle>
          ))}
        </ToggleGroup>
      </div>
    )
  },
})

const chip =
  'h-7 rounded-md border border-separator px-2 text-xs text-ink-muted outline-none hover:bg-hover data-pressed:border-ink/30 data-pressed:bg-hover data-pressed:text-ink focus-visible:outline-2 focus-visible:outline-focus'

// Items

function CollectionChips({ ids }: { ids: string[] }) {
  const host = useHost()
  if (!ids.length)
    return <span className="text-xs text-ink-faint">Not filed</span>
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {ids.map((id) => (
        <span
          key={id}
          className="truncate rounded bg-hover px-1.5 py-px text-[11px] text-ink-muted"
        >
          {host.collectionName(id) ?? id}
        </span>
      ))}
    </span>
  )
}

function ItemButton({
  item,
  className,
  children,
}: {
  item: IndexItem
  className?: string
  children: ReactNode
}) {
  const host = useHost()
  const selected = host.selectedId === item.documentId
  return (
    <button
      type="button"
      aria-current={selected || undefined}
      onClick={() => host.openItem(item.documentId)}
      className={cn(
        'w-full text-start outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
        selected ? 'bg-hover' : 'hover:bg-hover/60',
        className,
      )}
    >
      {children}
    </button>
  )
}

type Presentation = 'list' | 'gallery' | 'table'
const PRESENTATIONS: Presentation[] = ['list', 'gallery', 'table']

function groupItems(
  items: IndexItem[],
  groupBy: 'collection' | 'kind' | 'none',
  name: (collectionId: string) => string | undefined,
): [string, IndexItem[]][] {
  if (groupBy === 'none') return [['', items]]
  const groups = new Map<string, IndexItem[]>()
  for (const item of items) {
    const key =
      groupBy === 'kind'
        ? item.documentKind || 'Other'
        : item.collectionIds[0]
          ? (name(item.collectionIds[0]) ?? item.collectionIds[0])
          : 'Not filed'
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups]
}

function ItemsAs({
  items,
  presentation,
}: {
  items: IndexItem[]
  presentation: Presentation
}) {
  if (presentation === 'gallery')
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
        {items.map((item) => (
          <ItemButton
            key={item.documentId}
            item={item}
            className="flex h-36 flex-col gap-1.5 rounded-lg border border-separator p-3"
          >
            <span className="line-clamp-2 text-sm font-medium">
              {item.title}
            </span>
            <span className="line-clamp-3 text-xs leading-5 text-ink-muted">
              {item.snippet}
            </span>
            <span className="mt-auto">
              <CollectionChips ids={item.collectionIds} />
            </span>
          </ItemButton>
        ))}
      </div>
    )
  if (presentation === 'table')
    return (
      <div className="overflow-x-auto rounded-lg border border-separator">
        <table className="w-full text-sm">
          <thead className="text-xs text-ink-faint">
            <tr className="border-b border-separator">
              <th className="px-3 py-2 text-start font-normal">Title</th>
              <th className="px-3 py-2 text-start font-normal">Kind</th>
              <th className="px-3 py-2 text-start font-normal">Collections</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <TableRow key={item.documentId} item={item} />
            ))}
          </tbody>
        </table>
      </div>
    )
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.documentId}>
          <ItemButton
            item={item}
            className="flex flex-col gap-0.5 rounded-md px-2.5 py-2"
          >
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {item.title}
              </span>
              <span className="shrink-0 text-[11px] text-ink-faint">
                {item.documentKind}
              </span>
            </span>
            {item.snippet && (
              <span className="truncate text-xs text-ink-muted">
                {item.snippet}
              </span>
            )}
          </ItemButton>
        </li>
      ))}
    </ul>
  )
}

function TableRow({ item }: { item: IndexItem }) {
  const host = useHost()
  const selected = host.selectedId === item.documentId
  return (
    <tr
      aria-selected={selected}
      onClick={() => host.openItem(item.documentId)}
      className={cn(
        'cursor-default border-b border-separator last:border-0',
        selected ? 'bg-hover' : 'hover:bg-hover/60',
      )}
    >
      <td className="px-3 py-2">
        <button
          type="button"
          className="text-start font-medium outline-none focus-visible:underline"
          onClick={(event) => {
            event.stopPropagation()
            host.openItem(item.documentId)
          }}
        >
          {item.title}
        </button>
      </td>
      <td className="px-3 py-2 text-ink-muted">{item.documentKind}</td>
      <td className="px-3 py-2">
        <CollectionChips ids={item.collectionIds} />
      </td>
    </tr>
  )
}

type ItemListProps = {
  items: unknown
  presentation?: Presentation
  groupBy?: 'collection' | 'kind' | 'none'
  empty?: string
}

function ItemListView({ props }: { props: ItemListProps }) {
  const host = useHost()
  const items = rows<IndexItem>(props.items)
  const [chosen, setChosen] = useState<Presentation>()
  const presentation = chosen ?? props.presentation ?? 'list'
  const groups = groupItems(items, props.groupBy ?? 'none', host.collectionName)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-faint tabular-nums">
          {items.length === 1 ? '1 item' : `${items.length} items`}
        </span>
        <ToggleGroup
          aria-label="Presentation"
          value={[presentation]}
          onValueChange={(next) => {
            const value = next[0]
            if (!value || value === presentation) return
            setChosen(value)
            host.record({
              kind: 'presentation_changed',
              detail: { presentation: value },
            })
          }}
          className="ms-auto flex gap-1"
        >
          {PRESENTATIONS.map((value) => (
            <Toggle key={value} value={value} className={chip}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </Toggle>
          ))}
        </ToggleGroup>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-separator px-3 py-6 text-center text-sm text-ink-muted">
          {props.empty ?? 'Nothing here yet.'}
        </p>
      ) : (
        groups.map(([group, members]) => (
          <div key={group} className="flex flex-col gap-1">
            {group && (
              <h4 className="px-2.5 pt-2 text-xs font-medium text-ink-faint">
                {group}
              </h4>
            )}
            <ItemsAs items={members} presentation={presentation} />
          </div>
        ))
      )}
    </div>
  )
}

const ItemList = defineComponent({
  name: 'ItemList',
  description:
    'Documents from an items or used_together Query, e.g. ItemList(found.items, "list", "collection", "Nothing yet."). The person can switch presentation; the program sets the starting one.',
  props: z.object({
    items: z.array(z.any()),
    presentation: z.enum(['list', 'gallery', 'table']).optional(),
    groupBy: z.enum(['collection', 'kind', 'none']).optional(),
    empty: z.string().optional(),
  }),
  component: ItemListView,
})

const Comparison = defineComponent({
  name: 'Comparison',
  description:
    'Documents side by side for working across them together: title, kind, collections and the opening text of each.',
  props: z.object({ items: z.array(z.any()) }),
  component: ({ props }) => {
    const items = rows<IndexItem>(props.items)
    return (
      <div className="flex snap-x gap-3 overflow-x-auto pb-1">
        {items.map((item) => (
          <ItemButton
            key={item.documentId}
            item={item}
            className="flex w-72 shrink-0 snap-start flex-col gap-2 rounded-lg border border-separator p-3"
          >
            <span className="text-sm font-medium">{item.title}</span>
            <span className="text-[11px] text-ink-faint">
              {item.documentKind}
            </span>
            <CollectionChips ids={item.collectionIds} />
            <span className="text-xs leading-5 text-ink-muted">
              {item.snippet}
            </span>
          </ItemButton>
        ))}
      </div>
    )
  },
})

/** Presentation words Theorem's templates may use, mapped onto this library's. */
const asPresentation = (value: unknown): Presentation =>
  value === 'table'
    ? 'table'
    : value === 'cards' || value === 'gallery'
      ? 'gallery'
      : 'list'

const IndexItems = defineComponent({
  name: 'IndexItems',
  description:
    'Template component: the whole response of an items Query in a presentation (list, table or cards), e.g. IndexItems(found, "table").',
  props: z.object({ items: z.any(), presentation: z.string().optional() }),
  component: ({ props }) => (
    <ItemListView
      props={{
        items: (props.items as { items?: unknown } | null)?.items,
        presentation: asPresentation(props.presentation),
      }}
    />
  ),
})

const latestReceipt = (history: unknown) =>
  rows<FilingReceipt>(
    (history as { receipts?: unknown } | null)?.receipts,
  ).reduce<FilingReceipt | undefined>(
    (best, r) => (!best || r.generation > best.generation ? r : best),
    undefined,
  )

const IndexComparison = defineComponent({
  name: 'IndexComparison',
  description:
    'Template component: documents side by side with where each is filed and why, from an items Query, a collections Query and one filing_history Query per document, in document order.',
  props: z.object({
    items: z.any(),
    collections: z.any(),
    filings: z.array(z.any()).optional(),
  }),
  component: function IndexComparisonView({ props }) {
    const host = useHost()
    const items = rows<IndexItem>(
      (props.items as { items?: unknown } | null)?.items,
    )
    const collections = rows<Collection>(
      (props.collections as { collections?: unknown } | null)?.collections,
    )
    const name = (id: string) =>
      collections.find((c) => c.collectionId === id)?.name ??
      host.collectionName(id) ??
      id
    return (
      <div className="flex snap-x gap-3 overflow-x-auto pb-1">
        {items.map((item, index) => {
          const receipt = latestReceipt(props.filings?.[index])
          return (
            <ItemButton
              key={item.documentId}
              item={item}
              className="flex w-72 shrink-0 snap-start flex-col gap-2 rounded-lg border border-separator p-3"
            >
              <span className="text-sm font-medium">{item.title}</span>
              <span className="text-[11px] text-ink-faint">
                {item.documentKind}
              </span>
              <CollectionChips ids={item.collectionIds} />
              {receipt && (
                <span className="text-xs text-ink-muted">
                  Filed in {name(receipt.destinationCollectionId)} by{' '}
                  {receipt.tier}, {Math.round(receipt.confidence * 100)}% sure
                  {receipt.lowConfidence ? ', worth a look' : ''}.
                </span>
              )}
              <span className="text-xs leading-5 text-ink-muted">
                {item.snippet}
              </span>
            </ItemButton>
          )
        })}
      </div>
    )
  },
})

const Timeline = defineComponent({
  name: 'Timeline',
  description: 'Documents in the order they last changed, newest first.',
  props: z.object({ items: z.array(z.any()) }),
  component: ({ props }) => {
    const items = [...rows<IndexItem>(props.items)].sort(
      (a, b) => b.updatedPosition - a.updatedPosition,
    )
    return (
      <ol className="flex flex-col border-s border-separator ps-3">
        {items.map((item) => (
          <li key={item.documentId} className="relative">
            <span className="absolute top-3.5 -start-[17px] size-2 rounded-full bg-ink-faint" />
            <ItemButton
              item={item}
              className="flex flex-col rounded-md px-2 py-2"
            >
              <span className="text-sm font-medium">{item.title}</span>
              <span className="truncate text-xs text-ink-muted">
                {item.snippet}
              </span>
            </ItemButton>
          </li>
        ))}
      </ol>
    )
  },
})

const CollectionGrid = defineComponent({
  name: 'CollectionGrid',
  description: 'Collections from a collections Query as cards that open them.',
  props: z.object({ collections: z.array(z.any()) }),
  component: function CollectionGridView({ props }) {
    const host = useHost()
    const collections = rows<Collection>(props.collections)
    if (!collections.length)
      return <p className="text-sm text-ink-muted">No collections yet.</p>
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
        {collections.map((collection) => (
          <button
            key={collection.collectionId}
            type="button"
            onClick={() => host.openCollection(collection.collectionId)}
            className="flex flex-col gap-1 rounded-lg border border-separator p-3 text-start outline-none hover:bg-hover/60 focus-visible:outline-2 focus-visible:outline-focus"
          >
            <span className="truncate text-sm font-medium">
              {collection.name}
            </span>
            <span className="text-xs text-ink-faint tabular-nums">
              {collection.documentCount === 1
                ? '1 document'
                : `${collection.documentCount} documents`}
              {collection.kind === 'auto' && ' · automatic'}
            </span>
          </button>
        ))}
      </div>
    )
  },
})

const FilingList = defineComponent({
  name: 'FilingList',
  description:
    'Filing receipts from a filing_history Query: where a document was filed, how and how confidently.',
  props: z.object({ receipts: z.array(z.any()) }),
  component: function FilingListView({ props }) {
    const host = useHost()
    const receipts = rows<FilingReceipt>(props.receipts)
    if (!receipts.length)
      return <p className="text-sm text-ink-muted">Not filed yet.</p>
    return (
      <ul className="flex flex-col gap-1 text-sm">
        {receipts.map((receipt) => (
          <li key={receipt.receiptId} className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate">
              {host.collectionName(receipt.destinationCollectionId) ??
                receipt.destinationCollectionId}
            </span>
            <span className="text-xs text-ink-faint">{receipt.tier}</span>
            <span className="text-xs text-ink-faint tabular-nums">
              {Math.round(receipt.confidence * 100)}%
            </span>
          </li>
        ))}
      </ul>
    )
  },
})

const Atlas = defineComponent({
  name: 'Atlas',
  description:
    'The semantic map of the material from a map Query, coloured by an overlay. A view of the material, never its filing.',
  props: z.object({
    snapshot: z.any(),
    overlay: z
      .enum(['density', 'boundary', 'quantization_error', 'activity'])
      .optional(),
  }),
  component: function AtlasView({ props }) {
    const host = useHost()
    return (
      <AtlasMap
        snapshot={(props.snapshot ?? null) as AtlasSnapshot | null}
        overlay={props.overlay ?? 'density'}
        onOpen={host.openItem}
      />
    )
  },
})

const ActionButton = defineComponent({
  name: 'ActionButton',
  description:
    'A button that runs an action: @OpenItem(id), @AskTheorem(prompt, ids), @PinView(), @SetPreference(statement, ids, value), or a built-in step.',
  props: z.object({
    label: z.string(),
    action: action(),
  }),
  component: function ActionButtonView({ props }) {
    const trigger = useTriggerAction()
    return (
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => void trigger(props.label, undefined, props.action)}
      >
        {props.label}
      </Button>
    )
  },
})

// Actions, delivered to the view renderer's onAction

const OpenItem = defineAction({
  name: 'OpenItem',
  description: 'Open a document in the working pane.',
  params: z.object({ documentId: z.string() }),
})

const AskTheorem = defineAction({
  name: 'AskTheorem',
  description: 'Start a conversation with Theorem about these documents.',
  params: z.object({
    prompt: z.string(),
    documentIds: z.array(z.string()).optional(),
  }),
})

const PinView = defineAction({
  name: 'PinView',
  description: 'Pin this view so it stays as it is.',
  params: z.object({}),
})

const SetPreference = defineAction({
  name: 'SetPreference',
  description:
    'Record what the person said they want: keep_view, prefer_presentation (value list|gallery|table), belong_together or not_together (documentIds).',
  params: z.object({
    statement: z.enum([
      'keep_view',
      'prefer_presentation',
      'belong_together',
      'not_together',
    ]),
    documentIds: z.array(z.string()).optional(),
    value: z.string().optional(),
  }),
})

export const indexLibrary = createLibrary({
  id: 'theorem.index',
  root: 'Stack',
  components: [
    Stack,
    Columns,
    Section,
    Heading,
    Text,
    Callout,
    Metric,
    SearchField,
    Choice,
    ItemList,
    Comparison,
    IndexItems,
    IndexComparison,
    Timeline,
    CollectionGrid,
    FilingList,
    Atlas,
    ActionButton,
  ],
  componentGroups: [
    { name: 'Layout', components: ['Stack', 'Columns', 'Section'] },
    { name: 'Text', components: ['Heading', 'Text', 'Callout', 'Metric'] },
    { name: 'Inputs', components: ['SearchField', 'Choice'] },
    {
      name: 'Material',
      components: [
        'ItemList',
        'Comparison',
        'IndexItems',
        'IndexComparison',
        'Timeline',
        'CollectionGrid',
        'FilingList',
        'Atlas',
      ],
    },
    { name: 'Actions', components: ['ActionButton'] },
  ],
  actions: [OpenItem, AskTheorem, PinView, SetPreference],
})

export type IndexLibrary = typeof indexLibrary

/**
 * OpenUI's own calls, which its package does not export by name: the
 * reserved Query and Mutation, the Action combinator, the built-in steps and
 * the built-in functions. library.test.ts parses a program that uses every
 * one, so an upgrade that renames or drops one fails there.
 */
export const OPENUI_COMPONENTS = ['Query', 'Mutation', 'Action'] as const
export const OPENUI_CALLABLES = [
  'Run',
  'ToAssistant',
  'OpenUrl',
  'Set',
  'Reset',
  'Count',
  'First',
  'Last',
  'Sum',
  'Avg',
  'Min',
  'Max',
  'Sort',
  'Filter',
  'Round',
  'Abs',
  'Floor',
  'Ceil',
  'Each',
] as const

const PROMPT_RULES = [
  'A view is one program. Its data comes only from Query("<binding>", {args}, default), where <binding> is one of the binding names the request lists; arguments narrow the binding, they never change its kind.',
  'Results: items and used_together bindings return {items, total}; collections returns {collections}; filing_history returns {receipts}; map returns {snapshot}.',
  'Keep views calm: one primary list or comparison, a search field when the material is long, at most one Callout.',
  'Never invent document ids; use the ids the request gives you.',
]

const TOOL_EXAMPLE = `$q = ""
root = Stack([search, results])
search = SearchField("Search these documents", $q)
found = Query("items", {q: $q}, {items: [], total: 0})
results = ItemList(found.items, "list", "collection", "Nothing matches yet.")`

/** The prompt Theorem composes candidates with, and the names the server lints against. */
export function libraryPrompt() {
  return indexLibrary.prompt({
    preamble:
      "You compose views of a person's filed material in Theorem's Index. Answer with OpenUI Lang only.",
    additionalRules: PROMPT_RULES,
    toolExamples: [TOOL_EXAMPLE],
    toolCalls: true,
    bindings: true,
  })
}

export const libraryComponents = () => [
  ...Object.keys(indexLibrary.components),
  ...OPENUI_COMPONENTS,
]

export const libraryCallables = () => [
  ...OPENUI_CALLABLES,
  ...Object.keys(indexLibrary.actions),
]

async function sha256(text: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** The record PUT /api/index/v1/library stores; the digest covers everything the server reads. */
export async function libraryRecord() {
  const prompt = libraryPrompt()
  const components = libraryComponents()
  const callables = libraryCallables()
  return {
    libraryId: 'theorem.index',
    version: '1',
    digest: await sha256(JSON.stringify({ prompt, components, callables })),
    prompt,
    components,
    callables,
  }
}
