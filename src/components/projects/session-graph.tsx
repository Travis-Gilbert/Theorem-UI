// SOURCING: date-fns for how long ago, @xyflow/react 12 (custom session and project nodes at fixed sizes, BaseEdge and EdgeLabelRenderer for routed edges, Controls, dotted Background, fitView), laid out by elkjs through lib/theorem/session-graph-layout; lib/theorem/session-graph for the lens projection; the session marks from components/organize/glyphs. Read only: nothing here drags, connects, deletes or writes. A selection is view state and stays in this component.
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getStraightPath,
  useReactFlow,
} from '@xyflow/react'
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Link } from '@tanstack/react-router'
import { formatDistanceToNowStrict } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import { ProjectGlyph, SessionGlyph } from '@/components/organize/glyphs'
import { layoutGraph } from '@/lib/theorem/session-graph-layout'
import type { GraphLayout } from '@/lib/theorem/session-graph-layout'
import {
  LENSES,
  RELATION_LABEL,
  describeEdges,
  lensInfo,
} from '@/lib/theorem/session-graph'
import type {
  GraphEdge,
  GraphLens,
  GraphNode,
  ProjectNode as ProjectRecord,
  Relation,
  SessionGraph as Graph,
  SessionNode as SessionRecord,
} from '@/lib/theorem/session-graph'
import { useSessionType } from '@/lib/theorem/sidebar-prefs'
import { cn } from '@/lib/utils'

/** How long since a session last moved, as the sidebar says it. */
const relativeTime = (atMs: number) =>
  Date.now() - atMs < 60_000
    ? 'just now'
    : `${formatDistanceToNowStrict(atMs)} ago`

const SIZE = {
  session: { width: 224, height: 48 },
  project: { width: 184, height: 40 },
} as const

type Point = { x: number; y: number }
type SessionFlowNode = Node<
  SessionRecord & { direction: 'RIGHT' | 'DOWN' },
  'session'
>
type ProjectFlowNode = Node<
  ProjectRecord & { direction: 'RIGHT' | 'DOWN' },
  'project'
>
type FlowNode = SessionFlowNode | ProjectFlowNode
type FlowEdge = Edge<{ relation: Relation; route?: Point[] }, 'relation'>

/** Each relation by line, not by colour alone: solid, dashed, fine, or fine with a label. */
const LINE: Readonly<
  Record<Relation, { dash?: string; width: number; label?: string }>
> = {
  forked: { width: 1.5 },
  continued: { dash: '6 4', width: 1.5, label: 'continues' },
  member: { width: 1 },
  kept: { width: 1, label: 'kept' },
}

const sides = (direction: 'RIGHT' | 'DOWN') =>
  direction === 'DOWN'
    ? { target: Position.Top, source: Position.Bottom }
    : { target: Position.Left, source: Position.Right }

function SessionCard({ data, selected }: NodeProps<SessionFlowNode>) {
  const type = useSessionType(data.threadId)
  const side = sides(data.direction)
  return (
    <div
      title={data.title}
      style={SIZE.session}
      className={cn(
        'flex items-center gap-2.5 rounded-lg bg-raised px-3 text-start ring-1 ring-separator transition-shadow',
        // A ring is a shadow and cannot be dashed; the outline can.
        data.outside &&
          'bg-transparent text-ink-muted ring-0 outline-1 -outline-offset-1 outline-ink-faint outline-dashed',
        selected && 'ring-2 ring-focus',
      )}
    >
      <Handle type="target" position={side.target} className="invisible" />
      <SessionGlyph threadId={data.threadId} className="text-ink-muted" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span data-appearance-recipe="ui.label" className="truncate text-ink">
          {data.title}
        </span>
        <span className="truncate text-xs text-ink-muted">
          {data.outside
            ? 'In another project'
            : `${type.label} · ${relativeTime(data.lastMovedMs)}`}
        </span>
      </span>
      {(data.running || data.wanting) && (
        <span
          aria-hidden
          className={cn(
            'size-2 shrink-0 rounded-full',
            data.wanting ? 'bg-attention' : 'bg-teal dark:bg-teal-ink',
          )}
        />
      )}
      <Handle type="source" position={side.source} className="invisible" />
    </div>
  )
}

function ProjectCard({ data, selected }: NodeProps<ProjectFlowNode>) {
  const side = sides(data.direction)
  return (
    <div
      title={data.title}
      style={SIZE.project}
      className={cn(
        'flex items-center gap-2 rounded-lg bg-sidebar px-3 ring-1 ring-separator',
        data.scope && 'font-semibold',
        selected && 'ring-2 ring-focus',
      )}
    >
      <Handle type="target" position={side.target} className="invisible" />
      <ProjectGlyph aria-hidden className="size-4 shrink-0" />
      <span data-appearance-recipe="ui.label" className="truncate">
        {data.title}
      </span>
      <Handle type="source" position={side.source} className="invisible" />
    </div>
  )
}

function RelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
}: EdgeProps<FlowEdge>) {
  const relation = data?.relation ?? 'forked'
  const line = LINE[relation]
  const route = data?.route
  let path: string
  let labelAt: Point
  if (route && route.length > 1) {
    path = route.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
    // The label sits on the route's middle segment.
    const mid = Math.floor((route.length - 1) / 2)
    labelAt = {
      x: (route[mid]!.x + route[mid + 1]!.x) / 2,
      y: (route[mid]!.y + route[mid + 1]!.y) / 2,
    }
  } else {
    const [straight, x, y] = getStraightPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
    })
    path = straight
    labelAt = { x, y }
  }
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: 'var(--color-ink-muted)',
          strokeWidth: line.width,
          strokeDasharray: line.dash,
        }}
      />
      {line.label && (
        <EdgeLabelRenderer>
          <span
            style={{
              transform: `translate(-50%, -50%) translate(${labelAt.x}px, ${labelAt.y}px)`,
            }}
            className="pointer-events-none absolute rounded-sm bg-sheet px-1 text-[0.6875rem] leading-4 text-ink-muted"
          >
            {line.label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const nodeTypes = { session: SessionCard, project: ProjectCard }
const edgeTypes = { relation: RelationEdge }

function Legend({ lens }: { lens: GraphLens }) {
  const relations: Relation[] =
    lens === 'lineage' ? ['forked', 'continued'] : ['member', 'kept']
  return (
    <ul
      aria-label="Legend"
      className="pointer-events-none absolute start-3 bottom-3 z-10 flex flex-col gap-1 rounded-lg bg-raised/90 px-3 py-2 text-xs text-ink-muted ring-1 ring-separator"
    >
      {relations.map((relation) => (
        <li key={relation} className="flex items-center gap-2">
          <svg aria-hidden width="28" height="6">
            <line
              x1="0"
              y1="3"
              x2="28"
              y2="3"
              stroke="currentColor"
              strokeWidth={LINE[relation].width}
              strokeDasharray={LINE[relation].dash}
            />
          </svg>
          {RELATION_LABEL[relation]}
        </li>
      ))}
      {lens === 'lineage' && (
        <li className="flex items-center gap-2">
          <span className="h-3 w-7 rounded-sm outline-1 -outline-offset-1 outline-ink-faint outline-dashed" />
          from another project
        </li>
      )}
    </ul>
  )
}

/** The selected node's record and every relation it takes part in, in words. */
function Inspector({
  graph,
  node,
  onClose,
}: {
  graph: Extract<Graph, { served: true }>
  node: GraphNode
  onClose: () => void
}) {
  const names = new Map(graph.nodes.map((n) => [n.id, n.title]))
  const relations = graph.edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) =>
      e.target === node.id
        ? `${RELATION_LABEL[e.relation]} ${names.get(e.source)}`
        : `${names.get(e.target)} ${RELATION_LABEL[e.relation]} this`,
    )
  return (
    <aside
      aria-label="Selected"
      className="absolute end-3 top-3 z-10 flex w-64 flex-col gap-3 rounded-xl bg-raised p-4 shadow-md ring-1 ring-separator"
    >
      <div className="flex items-start gap-2">
        {node.kind === 'session' ? (
          <SessionGlyph threadId={node.threadId} className="mt-0.5" />
        ) : (
          <ProjectGlyph aria-hidden className="mt-0.5 size-4 shrink-0" />
        )}
        <h3
          data-appearance-recipe="ui.section"
          className="min-w-0 flex-1 text-ink"
        >
          {node.title}
        </h3>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-6 items-center justify-center rounded-md text-ink-muted hover:bg-hover hover:text-ink"
        >
          <Icon.Close className="size-3.5" />
        </button>
      </div>
      {node.kind === 'session' && (
        <p className="text-xs text-ink-muted">
          {node.outside ? 'In another project · ' : ''}
          Last moved {relativeTime(node.lastMovedMs)}
          {node.running ? ' · running' : ''}
        </p>
      )}
      {relations.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {relations.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
      {node.kind === 'session' ? (
        <Link
          to="/c/$threadId"
          params={{ threadId: node.threadId }}
          className="self-start rounded-md px-2 py-1 text-sm text-ink ring-1 ring-separator hover:bg-hover"
        >
          Open session
        </Link>
      ) : (
        <Link
          to="/projects/$projectId"
          params={{ projectId: node.projectId }}
          className="self-start rounded-md px-2 py-1 text-sm text-ink ring-1 ring-separator hover:bg-hover"
        >
          Open project
        </Link>
      )}
    </aside>
  )
}

// Large projects stay readable: past this zoom the canvas pans instead of shrinking.
const FIT = { padding: 0.12, maxZoom: 1, minZoom: 0.6 } as const

function Flow({ graph }: { graph: Extract<Graph, { served: true }> }) {
  const [layout, setLayout] = useState<GraphLayout>()
  const [selected, setSelected] = useState<string>()
  const flow = useReactFlow()
  const frame = useRef<HTMLDivElement>(null)
  // Until the person pans or zooms, the graph follows its panel's size: the
  // dock can resize it after the first fit, and a stale fit leaves it off-centre.
  const moved = useRef(false)
  const info = lensInfo(graph.lens)
  const direction = info.layout.direction ?? 'RIGHT'

  useEffect(() => {
    let live = true
    const sizes = Object.fromEntries(
      graph.nodes.map((n) => [n.id, SIZE[n.kind]]),
    )
    void layoutGraph(graph.nodes, graph.edges, sizes, info.layout).then(
      (next) => {
        if (live) setLayout(next)
      },
    )
    return () => {
      live = false
    }
  }, [graph, info.layout])

  useEffect(() => {
    const element = frame.current
    if (!layout || !element) return
    const fit = async () => {
      await flow.fitView(FIT)
      if (flow.getZoom() > FIT.minZoom + 0.001) return
      // Too big to fit at a readable size: start from the top, where the
      // roots are, centred across when the width allows.
      const bounds = flow.getNodesBounds(flow.getNodes())
      const zoom = FIT.minZoom
      const width = element.clientWidth
      const pad = 24
      await flow.setViewport({
        x:
          bounds.width * zoom + pad * 2 < width
            ? (width - bounds.width * zoom) / 2 - bounds.x * zoom
            : pad - bounds.x * zoom,
        y: pad - bounds.y * zoom,
        zoom,
      })
    }
    const observer = new ResizeObserver(() => {
      if (!moved.current) void fit()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [layout, flow])

  const nodes = useMemo(
    (): FlowNode[] =>
      graph.nodes.map(
        (n) =>
          ({
            id: n.id,
            type: n.kind,
            position: layout?.positions[n.id] ?? { x: 0, y: 0 },
            data: { ...n, direction },
            selected: n.id === selected,
            width: SIZE[n.kind].width,
            height: SIZE[n.kind].height,
            ariaLabel:
              n.kind === 'session'
                ? `${n.title}${n.outside ? ', in another project' : ''}`
                : `Project ${n.title}`,
          }) as FlowNode,
      ),
    [graph.nodes, layout, selected, direction],
  )
  const edges = useMemo(
    (): FlowEdge[] =>
      graph.edges.map((e: GraphEdge) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'relation',
        selectable: false,
        focusable: false,
        data: { relation: e.relation, route: layout?.routes[e.id] },
        markerEnd:
          e.relation === 'member' || e.relation === 'kept'
            ? undefined
            : {
                type: MarkerType.ArrowClosed,
                width: 14,
                height: 14,
                color: 'var(--color-ink-muted)',
              },
      })),
    [graph.edges, layout],
  )
  const node = graph.nodes.find((n) => n.id === selected)

  // Mounted once ELK has placed everything, so the first fit sees the real positions.
  if (!layout) return null
  return (
    <div ref={frame} className="absolute inset-0">
      <ReactFlow<FlowNode, FlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={FIT}
        onMoveStart={(event) => {
          // Only a person's gesture carries an event; a fit does not.
          if (event) moved.current = true
        }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        deleteKeyCode={null}
        onNodeClick={(_, n) => setSelected(n.id)}
        onPaneClick={() => setSelected(undefined)}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--color-separator)"
        />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      <Legend lens={graph.lens} />
      {node && (
        <Inspector
          graph={graph}
          node={node}
          onClose={() => setSelected(undefined)}
        />
      )}
    </div>
  )
}

/** The graph as text: every node and every relation, for reading without the canvas. */
function GraphList({ graph }: { graph: Extract<Graph, { served: true }> }) {
  const sentences = describeEdges(graph)
  return (
    <div className="flex flex-col gap-4 overflow-auto p-4 text-sm">
      <section>
        <h3 data-appearance-recipe="ui.section" className="mb-1 text-ink">
          Relations
        </h3>
        {sentences.length ? (
          <ul className="flex flex-col gap-1">
            {sentences.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted">None in this project.</p>
        )}
      </section>
      <section>
        <h3 data-appearance-recipe="ui.section" className="mb-1 text-ink">
          Sessions
        </h3>
        <ul className="flex flex-col gap-1">
          {graph.nodes
            .filter((n) => n.kind === 'session')
            .map((n) => (
              <li key={n.id}>
                <Link
                  to="/c/$threadId"
                  params={{ threadId: n.threadId }}
                  className="hover:underline"
                >
                  {n.title}
                </Link>
                {n.outside && (
                  <span className="text-ink-muted"> · in another project</span>
                )}
              </li>
            ))}
        </ul>
      </section>
    </div>
  )
}

/**
 * A read-only graph of sessions through one lens, with a list beside it that
 * says the same in words. Choosing a lens, the list or a node changes what is
 * shown and nothing else.
 */
export function SessionGraphView({
  graph,
  lens,
  onLens,
}: {
  graph: Graph
  lens: GraphLens
  onLens: (lens: GraphLens) => void
}) {
  const [asList, setAsList] = useState(false)
  const info = lensInfo(lens)
  const empty = graph.served && graph.nodes.length === 0
  return (
    <div className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-xl ring-1 ring-separator">
      <div className="flex flex-wrap items-center gap-2 border-b border-separator px-3 py-2">
        <div
          role="radiogroup"
          aria-label="Lens"
          className="flex flex-wrap gap-0.5 rounded-lg bg-sidebar p-0.5"
        >
          {LENSES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={entry.id === lens}
              title={entry.description}
              onClick={() => onLens(entry.id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-sm text-ink-muted hover:text-ink',
                entry.id === lens && 'bg-raised text-ink shadow-sm',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {graph.served && (
          <button
            type="button"
            aria-pressed={asList}
            onClick={() => setAsList((v) => !v)}
            className="rounded-md px-2 py-1 text-sm text-ink-muted ring-1 ring-separator hover:bg-hover hover:text-ink"
          >
            {asList ? 'Show graph' : 'Show as list'}
          </button>
        )}
        <p className="basis-full text-xs text-ink-muted">{info.description}</p>
      </div>
      <div className="relative min-h-0 flex-1 bg-sheet">
        {!graph.served ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <p data-appearance-recipe="ui.section" className="text-ink">
              {info.label} is not served yet
            </p>
            <p className="max-w-md text-sm text-ink-muted">{graph.reason}</p>
          </div>
        ) : empty ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-ink-muted">
            No sessions in this project yet.
          </div>
        ) : asList ? (
          <GraphList graph={graph} />
        ) : (
          <ReactFlowProvider>
            <Flow key={lens} graph={graph} />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  )
}
