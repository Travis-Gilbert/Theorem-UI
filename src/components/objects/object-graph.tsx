// SOURCING: after Capacities' graph view (the owner's reference: objects as dots in their type's colour, a local graph around one object, a filter by type) and Craft web's collection pages for the chrome; @xyflow/react 12 (custom nodes, straight edges, Controls, dotted Background, fitView; the data model diagram uses it too) laid out by lib/graph-layout's ELK stress policy, so the graph settles once and nothing keeps moving; the edges are connections.ts's typed and directed connections; the list view is the same graph as a table for keyboard and screen reader use
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getStraightPath,
  useStore,
} from '@xyflow/react'
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/icons'
import { Segmented } from '@/components/records/field-form'
import { Button } from '@/components/ui/button'
import { layout } from '@/lib/graph-layout'
import type { ObjectClass } from '@/lib/objects/classes'
import { useCollections } from '@/lib/objects/collections'
import type { Connection } from '@/lib/objects/connections'
import { useObjectEntry, useObjectGraph } from '@/lib/objects/graph'
import type { ObjectEntry, ObjectRef } from '@/lib/objects/library'
import { useClassRegistry } from '@/lib/objects/register'
import { useCollectionObjects, useEveryObject } from '@/lib/objects/scoped'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import { ClassIcon } from './class-icon'
import { openPane, useOpenObject } from './object-actions'
import {
  KIND_LABEL,
  KIND_TONE,
  useLoadedMarkdown,
  useLocalSeeds,
} from './object-inspector'

const KINDS: Connection['kind'][] = ['explicit', 'provenance', 'inferred']
/** Past this many objects the global graph draws the most connected ones. */
const MOST = 300

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

type Scope =
  | { kind: 'global' }
  | { kind: 'local'; ref: ObjectRef }
  | { kind: 'collection'; id: string }

const scopeOf = (key: string): Scope => {
  if (key.startsWith('local:')) return { kind: 'local', ref: key.slice(6) }
  if (key.startsWith('collection:'))
    return { kind: 'collection', id: key.slice(11) }
  return { kind: 'global' }
}

/** The objects within `depth` hops of `ref`, over connections either way. */
function neighbourhood(
  ref: ObjectRef,
  connections: Connection[],
  depth: number,
) {
  const seen = new Set([ref])
  let edge = [ref]
  for (let hop = 0; hop < depth; hop++) {
    const next: ObjectRef[] = []
    for (const c of connections)
      for (const [a, b] of [
        [c.from, c.to],
        [c.to, c.from],
      ] as const)
        if (edge.includes(a) && !seen.has(b)) {
          seen.add(b)
          next.push(b)
        }
    edge = next
  }
  return seen
}

type ObjectNode = Node<
  { entry: ObjectEntry; centre: boolean; selected: boolean },
  'object'
>
type KindEdge = Edge<{ kind: Connection['kind']; label: string }, 'kind'>

// Names show once the graph is near its natural size, or for the object in
// hand; zoomed out, the dots and their class colours carry it.
const LABEL_ZOOM = 0.85
const centreHandle =
  '!top-1/2 !left-1/2 !size-1 !min-h-0 !min-w-0 !-translate-1/2 !border-0 !bg-transparent'

function ObjectNodeView({ data }: NodeProps<ObjectNode>) {
  const near = useStore((s) => s.transform[2] >= LABEL_ZOOM)
  const named = near || data.centre || data.selected
  return (
    <div className="relative size-6">
      <Handle type="target" position={Position.Top} className={centreHandle} />
      <ClassIcon
        cls={data.entry.cls}
        size="md"
        className={cn(
          'rounded-full! shadow-sm ring-(--notes-pane) ring-2',
          data.centre && 'ring-ink',
          data.selected && 'ring-ink',
        )}
      />
      {named && (
        <span
          className={cn(
            'absolute top-full left-1/2 mt-1 max-w-40 -translate-x-1/2 truncate rounded-sm bg-(--notes-pane)/85 px-1 text-[11px] leading-4 whitespace-nowrap',
            data.centre || data.selected ? 'font-medium' : 'text-ink-muted',
          )}
        >
          {data.entry.title}
        </span>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className={centreHandle}
      />
    </div>
  )
}

const EDGE_STYLE: Record<
  Connection['kind'],
  { strokeDasharray?: string; opacity: number }
> = {
  explicit: { opacity: 0.7 },
  provenance: { strokeDasharray: '6 4', opacity: 0.7 },
  inferred: { strokeDasharray: '1 4', opacity: 0.55 },
}

function KindEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
}: EdgeProps<KindEdge>) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  const style = EDGE_STYLE[data?.kind ?? 'explicit']
  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={{
        stroke: 'var(--color-ink-muted, currentColor)',
        strokeWidth: 1.25,
        ...style,
      }}
    />
  )
}

const nodeTypes = { object: ObjectNodeView }
const edgeTypes = { kind: KindEdgeView }

/** Objects and their connections: around one object, inside a collection, or everything. */
export function ObjectGraph({ scope: key }: { scope: string }) {
  const scope = scopeOf(key)
  const { registry } = useClassRegistry()
  const collections = useCollections(registry)
  const markdown = useLoadedMarkdown()
  const open = useOpenObject()
  const [view, setView] = useState<'graph' | 'list'>('graph')
  const [depth, setDepth] = useState<'1' | '2'>('1')
  const [hiddenClasses, setHiddenClasses] = useState<string[]>([])
  const [kinds, setKinds] = useState<Connection['kind'][]>([
    'explicit',
    'provenance',
  ])
  const [selected, setSelected] = useState<ObjectRef>()

  const collection =
    scope.kind === 'collection'
      ? collections.collections.find((c) => c.id === scope.id)
      : undefined

  // Where the graph starts: one object and the collections holding it, a
  // collection's members, or a page of everything, which the graph read
  // then walks out from on the server.
  const local = useObjectEntry(
    registry,
    scope.kind === 'local' ? scope.ref : undefined,
  )
  const localSeeds = useLocalSeeds(local.entry, collections, registry)
  const members = useCollectionObjects(registry, collection)
  const every = useEveryObject(registry, '', 'updated', scope.kind === 'global')
  const seeds =
    scope.kind === 'local'
      ? localSeeds
      : scope.kind === 'collection'
        ? members.entries
        : every.entries
  const seeding =
    scope.kind === 'local'
      ? local
      : scope.kind === 'collection'
        ? members
        : every
  const graph = useObjectGraph({
    registry,
    seeds,
    depth: scope.kind === 'local' ? Number(depth) : 0,
    collections: collections.collections,
    markdown,
    local: scope.kind === 'local',
  })
  const connections = graph.connections

  // The objects in scope, before the class filter.
  const inScope = useMemo(() => {
    const typed = connections.filter((c) => kinds.includes(c.kind))
    if (scope.kind === 'local')
      return { refs: neighbourhood(scope.ref, typed, Number(depth)), typed }
    if (scope.kind === 'collection') {
      const refs = new Set(collection?.members ?? [])
      // A collection's own "Contains" edges would make it the hub of its own graph.
      return {
        refs,
        typed: typed.filter(
          (c) =>
            c.from !== collection?.row.id &&
            !c.from.endsWith(`/${collection?.id}`),
        ),
      }
    }
    return { refs: new Set(graph.entries.map((e) => e.ref)), typed }
  }, [scope, connections, kinds, depth, collection, graph.entries])

  const classesInScope = useMemo(() => {
    const seen = new Map<string, ObjectClass>()
    for (const entry of graph.entries)
      if (inScope.refs.has(entry.ref)) seen.set(entry.cls.id, entry.cls)
    return [...seen.values()].sort((a, b) => a.plural.localeCompare(b.plural))
  }, [graph.entries, inScope.refs])

  const { entries, edges, total } = useMemo(() => {
    const byRef = new Map(graph.entries.map((e) => [e.ref, e]))
    let shown = [...inScope.refs]
      .map((ref) => byRef.get(ref))
      .filter(
        (e): e is ObjectEntry =>
          !!e &&
          (!hiddenClasses.includes(e.cls.id) ||
            (scope.kind === 'local' && e.ref === scope.ref)),
      )
    const count = shown.length
    const refs = () => new Set(shown.map((e) => e.ref))
    let present = refs()
    if (shown.length > MOST) {
      const degree = new Map<string, number>()
      for (const c of inScope.typed)
        if (present.has(c.from) && present.has(c.to)) {
          degree.set(c.from, (degree.get(c.from) ?? 0) + 1)
          degree.set(c.to, (degree.get(c.to) ?? 0) + 1)
        }
      shown = shown
        .sort((a, b) => (degree.get(b.ref) ?? 0) - (degree.get(a.ref) ?? 0))
        .slice(0, MOST)
      present = refs()
    }
    return {
      entries: shown,
      edges: inScope.typed.filter(
        (c) => present.has(c.from) && present.has(c.to),
      ),
      total: count,
    }
  }, [graph.entries, inScope, hiddenClasses, scope])

  const centre = scope.kind === 'local' ? scope.ref : undefined
  const title =
    scope.kind === 'local'
      ? `${graph.entries.find((e) => e.ref === scope.ref)?.title ?? 'Object'} graph`
      : scope.kind === 'collection'
        ? `${collection?.name ?? 'Collection'} graph`
        : 'Graph'
  const selectedEntry = entries.find((e) => e.ref === selected)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 px-6 pt-14 pb-3">
        <h1 className="min-w-0 flex-1 truncate font-heading text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {scope.kind === 'local' && (
          <Segmented
            label="Depth"
            value={depth}
            onChange={setDepth}
            options={[
              { value: '1', label: '1 step' },
              { value: '2', label: '2 steps' },
            ]}
          />
        )}
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'graph', label: 'Graph' },
            { value: 'list', label: 'List' },
          ]}
        />
      </header>
      <div
        className="flex flex-wrap items-center gap-1.5 px-6 pb-3"
        role="group"
        aria-label="Filters"
      >
        {classesInScope.map((cls) => {
          const on = !hiddenClasses.includes(cls.id)
          return (
            <button
              key={cls.id}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setHiddenClasses(
                  on
                    ? [...hiddenClasses, cls.id]
                    : hiddenClasses.filter((id) => id !== cls.id),
                )
              }
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-full border border-separator ps-1 pe-2.5 text-xs outline-none focus-visible:outline-2 focus-visible:outline-focus',
                on ? 'bg-pill text-ink' : 'text-ink-faint',
              )}
            >
              <ClassIcon cls={cls} className={on ? undefined : 'opacity-40'} />
              {cls.plural}
            </button>
          )
        })}
        <span aria-hidden className="mx-1 h-4 w-px bg-separator" />
        {KINDS.map((kind) => {
          const on = kinds.includes(kind)
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setKinds(
                  on ? kinds.filter((k) => k !== kind) : [...kinds, kind],
                )
              }
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-full border border-separator px-2.5 text-xs outline-none focus-visible:outline-2 focus-visible:outline-focus',
                on ? cn('bg-pill', KIND_TONE[kind]) : 'text-ink-faint',
              )}
            >
              <svg aria-hidden width="18" height="6" className="shrink-0">
                <line
                  x1="1"
                  y1="3"
                  x2="17"
                  y2="3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray={EDGE_STYLE[kind].strokeDasharray}
                />
              </svg>
              {KIND_LABEL[kind]}
            </button>
          )
        })}
        {(total > entries.length || graph.truncated) && (
          <span role="status" className="ms-auto text-xs text-ink-faint">
            {total > entries.length
              ? `${entries.length} of ${total}, most connected first`
              : `${entries.length} nearest`}
          </span>
        )}
        {scope.kind === 'global' && every.hasMore && (
          <Button
            variant="ghost"
            size="xs"
            className={
              total > entries.length || graph.truncated ? undefined : 'ms-auto'
            }
            disabled={every.isFetchingMore}
            onClick={every.loadMore}
          >
            More
          </Button>
        )}
      </div>
      <div className="relative flex min-h-0 flex-1">
        {(seeding.isPending || graph.isPending) && !graph.entries.length ? (
          <p role="status" className="m-auto text-sm text-ink-muted">
            Loading…
          </p>
        ) : seeding.error != null || graph.error != null ? (
          <p role="alert" className="m-auto truncate text-sm text-error-ink">
            {describeError(seeding.error ?? graph.error)}
          </p>
        ) : !entries.length ? (
          <p role="status" className="m-auto text-sm text-ink-muted">
            Nothing to draw.
          </p>
        ) : view === 'graph' ? (
          <GraphCanvas
            entries={entries}
            edges={edges}
            centre={centre}
            selected={selected}
            onSelect={setSelected}
            onOpen={(entry) => open(entry, true)}
          />
        ) : (
          <ConnectionList
            entries={entries}
            edges={edges}
            onOpen={(entry) => open(entry, true)}
          />
        )}
        {view === 'graph' && selectedEntry && (
          <aside
            aria-label={selectedEntry.title}
            className="absolute end-3 top-3 flex w-64 flex-col gap-2 rounded-xl border border-separator bg-(--notes-pane) p-3 shadow-lg"
          >
            <div className="flex items-center gap-2">
              <ClassIcon cls={selectedEntry.cls} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {selectedEntry.title}
                </p>
                <p className="text-xs text-ink-faint">
                  {selectedEntry.cls.label}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelected(undefined)}
                className="flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-hover"
              >
                <Icon.Close className="size-3.5" />
              </button>
            </div>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
              {edges
                .filter(
                  (c) =>
                    c.from === selectedEntry.ref || c.to === selectedEntry.ref,
                )
                .map((c) => {
                  const out = c.from === selectedEntry.ref
                  const other = entries.find(
                    (e) => e.ref === (out ? c.to : c.from),
                  )
                  return (
                    <li key={c.id} className="flex items-center gap-1.5">
                      <span className={cn('shrink-0', KIND_TONE[c.kind])}>
                        {out ? c.label : `${c.label} ←`}
                      </span>
                      <button
                        type="button"
                        onClick={() => other && setSelected(other.ref)}
                        className="min-w-0 truncate text-start hover:underline"
                      >
                        {other?.title}
                      </button>
                    </li>
                  )
                })}
            </ul>
            <div className="flex gap-1.5">
              <Button size="xs" onClick={() => open(selectedEntry, true)}>
                Open
              </Button>
              {centre !== selectedEntry.ref && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    openPane({
                      kind: 'graph',
                      key: `local:${selectedEntry.ref}`,
                    })
                  }
                >
                  Its graph
                </Button>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

function GraphCanvas({
  entries,
  edges,
  centre,
  selected,
  onSelect,
  onOpen,
}: {
  entries: ObjectEntry[]
  edges: Connection[]
  centre?: ObjectRef
  selected?: ObjectRef
  onSelect: (ref: ObjectRef | undefined) => void
  onOpen: (entry: ObjectEntry) => void
}) {
  const [positions, setPositions] =
    useState<Record<string, { x: number; y: number }>>()
  const shape = `${entries.map((e) => e.ref).join(',')}|${edges.map((e) => e.id).join(',')}`
  useEffect(() => {
    let live = true
    void layout(
      {
        nodes: entries.map((e) => ({
          id: e.ref,
          width: 24,
          height: 24,
        })),
        edges: edges.map((c) => ({ id: c.id, source: c.from, target: c.to })),
      },
      {
        algorithm: 'stress',
        spacing: { node: 56 },
        edgeLength: 120,
        padding: 40,
      },
    ).then((result) => live && setPositions(result.positions))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `shape` names the graph
  }, [shape])

  const nodes: ObjectNode[] = useMemo(
    () =>
      entries.map((entry) => ({
        id: entry.ref,
        type: 'object',
        position: positions?.[entry.ref] ?? { x: 0, y: 0 },
        data: {
          entry,
          centre: entry.ref === centre,
          selected: entry.ref === selected,
        },
        ariaLabel: `${entry.cls.label}: ${entry.title}`,
      })),
    [entries, positions, centre, selected],
  )
  const flowEdges: KindEdge[] = useMemo(
    () =>
      edges.map((c) => ({
        id: c.id,
        source: c.from,
        target: c.to,
        type: 'kind',
        data: { kind: c.kind, label: c.label },
        ariaLabel: `${c.label} (${KIND_LABEL[c.kind]})`,
      })),
    [edges],
  )
  if (!positions)
    return (
      <p role="status" className="m-auto text-sm text-ink-muted">
        Laying out…
      </p>
    )
  return (
    <ReactFlowProvider>
      <ReactFlow<ObjectNode, KindEdge>
        key={shape}
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{
          padding: 0.2,
          maxZoom: 1,
          duration: reducedMotion() ? 0 : 200,
        }}
        minZoom={0.1}
        nodesConnectable={false}
        nodesDraggable={false}
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodeDoubleClick={(_, node) => onOpen(node.data.entry)}
        onPaneClick={() => onSelect(undefined)}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement
          const id = target.closest<HTMLElement>('[data-id]')?.dataset.id
          if (event.key === 'Enter' && id) {
            const entry = entries.find((e) => e.ref === id)
            if (entry) onOpen(entry)
          }
        }}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
    </ReactFlowProvider>
  )
}

/** The same graph as rows: each object, then what it points to and what points to it. */
function ConnectionList({
  entries,
  edges,
  onOpen,
}: {
  entries: ObjectEntry[]
  edges: Connection[]
  onOpen: (entry: ObjectEntry) => void
}) {
  const byRef = new Map(entries.map((e) => [e.ref, e]))
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10">
      <table className="w-full text-sm">
        <thead className="text-start text-xs text-ink-faint">
          <tr>
            <th scope="col" className="py-2 text-start font-medium">
              From
            </th>
            <th scope="col" className="py-2 text-start font-medium">
              Connection
            </th>
            <th scope="col" className="py-2 text-start font-medium">
              To
            </th>
            <th scope="col" className="py-2 text-start font-medium">
              Kind
            </th>
          </tr>
        </thead>
        <tbody>
          {edges.map((c) => {
            const from = byRef.get(c.from)
            const to = byRef.get(c.to)
            if (!from || !to) return null
            return (
              <tr key={c.id} className="border-t border-separator">
                <td className="py-1.5 pe-3">
                  <EntryButton entry={from} onOpen={onOpen} />
                </td>
                <td className="py-1.5 pe-3 text-ink-muted">{c.label}</td>
                <td className="py-1.5 pe-3">
                  <EntryButton entry={to} onOpen={onOpen} />
                </td>
                <td className={cn('py-1.5 text-xs', KIND_TONE[c.kind])}>
                  {KIND_LABEL[c.kind]}
                </td>
              </tr>
            )
          })}
          {entries
            .filter(
              (e) => !edges.some((c) => c.from === e.ref || c.to === e.ref),
            )
            .map((e) => (
              <tr key={e.ref} className="border-t border-separator">
                <td className="py-1.5 pe-3">
                  <EntryButton entry={e} onOpen={onOpen} />
                </td>
                <td className="py-1.5 text-ink-faint" colSpan={3}>
                  No connections
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

const EntryButton = ({
  entry,
  onOpen,
}: {
  entry: ObjectEntry
  onOpen: (entry: ObjectEntry) => void
}) => (
  <button
    type="button"
    onClick={() => onOpen(entry)}
    className="flex max-w-full items-center gap-1.5 rounded text-start outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus"
  >
    <ClassIcon cls={entry.cls} />
    <span className="truncate">{entry.title}</span>
  </button>
)
