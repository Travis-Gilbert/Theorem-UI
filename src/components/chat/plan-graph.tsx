// SOURCING: @xyflow/react 12 (custom task nodes sized by their content and measured by React Flow, useNodesInitialized to know when every node has measured, BaseEdge and getSmoothStepPath for edges, useInternalNode to tell whether a dragged task left its routed place, a fixed handle on each side with edges naming the pair their layout faces, useNodesState for drag and selection, Controls, dotted Background, fitView) laid out by elkjs through lib/theorem/plans over those measured sizes, its orthogonal routes drawn with d3-shape's line; @radix-ui/react-use-size for the card's width (graph or compact summary); ui/dialog (Base UI Dialog) for the expanded workspace; @tanstack/react-query for Theorem's live copy of the plan, polled while framer-motion's useInView sees the card; assistant-ui's ToolCallMessagePartComponent for the draft_plan call, with the installed ToolFallback and ThinkingIndicator for its failed and running states
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  useInternalNode,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
} from '@xyflow/react'
import type {
  Edge,
  EdgeProps,
  Node,
  NodeChange,
  NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ToolCallMessagePartComponent } from '@assistant-ui/react'
import { useSize } from '@radix-ui/react-use-size'
import { useQuery } from '@tanstack/react-query'
import { line } from 'd3-shape'
import { useInView } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import { ThinkingIndicator } from '@/components/assistant-ui/elements/thinking-indicator'
import { ToolFallback } from '@/components/assistant-ui/elements/tool-fallback.aui'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { describeError } from '@/lib/theorem/client'
import {
  LIVE_PLAN_REFRESH_MS,
  draftPlanView,
  edgeId,
  fitScale,
  fittedLayout,
  livePlanQuery,
  taskLabel,
  taskOrder,
  taskTones,
} from '@/lib/theorem/plans'
import type {
  PlanLayout,
  PlanTaskView,
  PlanView,
  Point,
  Size,
  TaskTone,
} from '@/lib/theorem/plans'
import { cn } from '@/lib/utils'

/**
 * Each tone in words and as a mark. The shape carries the state as well as
 * the colour: filled for settled, a ring for open, a diamond for a decision
 * owed, a bar for dropped.
 */
export const TONE: Readonly<Record<TaskTone, { label: string; mark: string }>> =
  {
    done: { label: 'Done', mark: 'rounded-full bg-teal' },
    active: {
      label: 'In progress',
      mark: 'rounded-full border-2 border-ochre bg-ochre/40 animate-pulse motion-reduce:animate-none',
    },
    ready: { label: 'Ready', mark: 'rounded-full border-2 border-redwood' },
    waiting: { label: 'Waiting', mark: 'rounded-full border border-ink-faint' },
    attention: {
      label: 'Needs attention',
      mark: 'scale-90 rotate-45 rounded-[1px] bg-ochre',
    },
    deviating: {
      label: 'Deviating: needs a decision',
      mark: 'scale-90 rotate-45 rounded-[1px] border-2 border-ochre',
    },
    dropped: { label: 'Dropped', mark: '!h-0.5 rounded-full bg-ink-faint' },
  }

/** A task's status as a mark beside its label: it takes no row of its own. */
function StatusMark({
  tone,
  className,
}: {
  tone: TaskTone
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      data-plan-mark={tone}
      title={TONE[tone].label}
      // Centred on the first line of the label beside it.
      className={cn(
        'mt-[calc((1lh-0.5rem)/2)] size-2 shrink-0',
        TONE[tone].mark,
        className,
      )}
    />
  )
}

type TaskNodeData = {
  label: string
  title: string
  tone: TaskTone
  /** On the reading surface a task is a button that opens the workspace on it. */
  open?: (() => void) | undefined
}
type TaskNode = Node<TaskNodeData, 'task'>

const hidden = '!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent'

function TaskNodeView({ data, selected }: NodeProps<TaskNode>) {
  const body = (
    <>
      <StatusMark tone={data.tone} />
      <span
        data-plan-label
        className={cn(
          'min-w-0 font-medium text-ink',
          data.tone === 'dropped' && 'line-through',
        )}
      >
        {data.label}
      </span>
    </>
  )
  const frame = cn(
    // Sized by its label: as wide as the words up to a measure, as tall as they wrap.
    'flex w-max max-w-52 items-start gap-1.5 rounded-lg border bg-raised px-2.5 py-1.5 text-left text-[13px] leading-snug shadow-sm transition-colors duration-100',
    selected ? 'border-redwood ring-1 ring-redwood' : 'border-separator',
    data.tone === 'dropped' && 'opacity-60',
  )
  return (
    <>
      {/* A handle on every side, fixed, so React Flow measures them once; each edge names the pair its layout faces. */}
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        className={hidden}
      />
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className={hidden}
      />
      {data.open ? (
        <button
          type="button"
          title={data.title}
          aria-label={`${data.title}, ${TONE[data.tone].label}`}
          onClick={data.open}
          className={cn(
            frame,
            'hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus',
          )}
        >
          {body}
        </button>
      ) : (
        <div title={data.title} className={frame}>
          {body}
        </div>
      )}
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className={hidden}
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className={hidden}
      />
    </>
  )
}

type RouteData = {
  route?: Point[] | undefined
  from?: Point | undefined
  to?: Point | undefined
}
type RouteEdge = Edge<RouteData, 'route'>

const near = (a: Point | undefined, b: Point | undefined) =>
  a !== undefined &&
  b !== undefined &&
  Math.abs(a.x - b.x) < 0.5 &&
  Math.abs(a.y - b.y) < 0.5
const polyline = line<Point>()
  .x((point) => point.x)
  .y((point) => point.y)

/** The edge as the layout routed it; once a person drags either end away, a step path between the handles. */
function RouteEdgeView(props: EdgeProps<RouteEdge>) {
  const { id, source, target, data, markerEnd, style } = props
  const from = useInternalNode(source)?.internals.positionAbsolute
  const to = useInternalNode(target)?.internals.positionAbsolute
  const routed =
    data?.route && near(from, data.from) && near(to, data.to)
      ? polyline(data.route)
      : null
  const path = routed ?? getSmoothStepPath({ ...props, borderRadius: 6 })[0]
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
}

const nodeTypes = { task: TaskNodeView }
const edgeTypes = { route: RouteEdgeView }

/** A key that changes only when the plan's tasks or dependencies do, not with each live read. */
const shapeOf = (view: PlanView) =>
  view.tasks
    .map((task) => `${task.id}<${task.dependencies.join(',')}`)
    .join('|')

type FlowProps = {
  view: PlanView
  tones: ReadonlyMap<string, TaskTone>
  /** The space to fit the plan into; layout waits for it. */
  box: Size | undefined
  /** The workspace: tasks drag, select, pan and zoom. Otherwise the reading surface, where tasks drag within the card and a click opens the workspace. */
  interactive: boolean
  selected?: string | undefined
  onSelect: (id: string | undefined) => void
  onOpen?: (id: string) => void
  onLayout?: (layout: PlanLayout) => void
  padding: number
  /** Changes once a scaled container has settled; React Flow measures handles again, as a scaled ancestor skews them. */
  settled?: number | undefined
}

/** The plan's graph. Nodes render at their content's size first; once React Flow has measured them all, ELK lays them out. */
function PlanFlow(props: FlowProps) {
  return (
    <ReactFlowProvider>
      <FlowBody {...props} />
    </ReactFlowProvider>
  )
}

function FlowBody({
  view,
  tones,
  box,
  interactive,
  selected,
  onSelect,
  onOpen,
  onLayout,
  padding,
  settled,
}: FlowProps) {
  const flow = useReactFlow<TaskNode, RouteEdge>()
  const updateNodeInternals = useUpdateNodeInternals()
  const measuredAll = useNodesInitialized()
  const paneWidth = useStore((state) => state.width)
  const paneHeight = useStore((state) => state.height)
  const [panX, panY, zoom] = useStore((state) => state.transform)
  const [layout, setLayout] = useState<PlanLayout>()
  const moved = useRef(new Set<string>())
  const openRef = useRef(onOpen)
  useLayoutEffect(() => {
    openRef.current = onOpen
  })

  const base = useMemo(
    () =>
      view.tasks.map((task): TaskNode => {
        const tone = tones.get(task.id) ?? 'waiting'
        return {
          id: task.id,
          type: 'task',
          position: { x: 0, y: 0 },
          data: {
            label: taskLabel(task),
            title: task.title,
            tone,
            open: interactive ? undefined : () => openRef.current?.(task.id),
          },
          ariaLabel: `${task.title}, ${TONE[tone].label}`,
          focusable: interactive,
        }
      }),
    [view, tones, interactive],
  )
  const [nodes, setNodes, applyNodeChanges] = useNodesState<TaskNode>(
    base.map((node) => ({ ...node, selected: node.id === selected })),
  )
  // React Flow reports a selection the person made (a click, Enter on a focused task, a click on
  // the pane) as `select` changes; the selection passed in reaches the nodes without one.
  const onNodesChange = (changes: NodeChange<TaskNode>[]) => {
    applyNodeChanges(changes)
    const selections = changes.filter((change) => change.type === 'select')
    if (selections.length)
      onSelect(selections.find((change) => change.selected)?.id)
  }

  // A refreshed plan keeps where each task sits, how it measured, and where the person dragged it.
  useEffect(() => {
    setNodes((current) => {
      const before = new Map(current.map((node) => [node.id, node]))
      return base.map((node) => {
        const previous = before.get(node.id)
        return previous
          ? {
              ...previous,
              data: node.data,
              ariaLabel: node.ariaLabel,
            }
          : node
      })
    })
  }, [base, setNodes])

  useEffect(() => {
    setNodes((current) =>
      current.map((node) =>
        (node.selected ?? false) === (node.id === selected)
          ? node
          : { ...node, selected: node.id === selected },
      ),
    )
  }, [selected, setNodes])

  // Lay out at the measured sizes, again when a size, the plan's shape or the space changes.
  const sizes = measuredAll
    ? nodes
        .map(
          (node) =>
            `${node.id}:${node.measured?.width}x${node.measured?.height}`,
        )
        .join('|')
    : undefined
  const shape = shapeOf(view)
  const space = box && `${Math.round(box.width)}x${Math.round(box.height)}`
  // The layout reads these as they stand when a key changes, not as further keys.
  const latest = useRef({ nodes, view, box, onLayout })
  useLayoutEffect(() => {
    latest.current = { nodes, view, box, onLayout }
  })
  useEffect(() => {
    const { nodes: measured, view: plan, box: area } = latest.current
    if (!sizes || !area) return
    let live = true
    const of = Object.fromEntries(
      measured.map((node) => [
        node.id,
        {
          width: node.measured?.width ?? 0,
          height: node.measured?.height ?? 0,
        },
      ]),
    )
    void fittedLayout(plan.tasks, of, area).then((next) => {
      if (!live) return
      setLayout(next)
      latest.current.onLayout?.(next)
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          position: moved.current.has(node.id)
            ? node.position
            : (next.positions[node.id] ?? node.position),
        })),
      )
    })
    return () => {
      live = false
    }
  }, [sizes, shape, space, setNodes])

  useEffect(() => {
    if (layout) void flow.fitView({ padding: `${padding}px`, maxZoom: 1 })
  }, [layout, paneWidth, paneHeight, padding, flow])

  useEffect(() => {
    if (settled)
      updateNodeInternals(latest.current.view.tasks.map((task) => task.id))
  }, [settled, updateNodeInternals])

  const edges = useMemo(() => {
    const ids = new Set(view.tasks.map((task) => task.id))
    const down = layout?.direction === 'DOWN'
    return view.tasks.flatMap((task) =>
      task.dependencies
        .filter((dependency) => ids.has(dependency) && dependency !== task.id)
        .map((dependency): RouteEdge => {
          const id = edgeId(dependency, task.id)
          return {
            id,
            source: dependency,
            target: task.id,
            sourceHandle: down ? 'bottom' : 'right',
            targetHandle: down ? 'top' : 'left',
            type: 'route',
            selectable: false,
            focusable: false,
            data: {
              route: layout?.routes[id],
              from: layout?.positions[dependency],
              to: layout?.positions[task.id],
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 14,
              height: 14,
              color: 'var(--color-ink-faint)',
            },
            style: { stroke: 'var(--color-ink-faint)', strokeWidth: 1.25 },
          }
        }),
    )
  }, [view.tasks, layout])

  return (
    <ReactFlow<TaskNode, RouteEdge>
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_, node) => moved.current.add(node.id)}
      data-plan-direction={layout?.direction}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      // Hidden until laid out, so the measuring pass never shows.
      className={cn(!layout && 'opacity-0')}
      minZoom={0.2}
      maxZoom={1.5}
      nodesConnectable={false}
      nodesDraggable
      // The card neither pans nor fits on demand, so a task drags within what the card shows.
      autoPanOnNodeDrag={interactive}
      nodeExtent={
        interactive || !layout
          ? undefined
          : [
              [(EDGE_GAP - panX) / zoom, (EDGE_GAP - panY) / zoom],
              [
                (paneWidth - EDGE_GAP - panX) / zoom,
                (paneHeight - EDGE_GAP - panY) / zoom,
              ],
            ]
      }
      elementsSelectable={interactive}
      panOnDrag={interactive}
      zoomOnPinch={interactive}
      // Tasks are Theorem's to remove; a key here would only hide one from the card.
      deleteKeyCode={null}
      multiSelectionKeyCode={null}
      // The card sits in a scrolling transcript: the wheel scrolls the page, pinch and the controls zoom.
      zoomOnScroll={false}
      preventScrolling={false}
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}
    >
      {interactive && (
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      )}
      {interactive && (
        <Controls position="bottom-left" showInteractive={false} />
      )}
    </ReactFlow>
  )
}

function TaskDetail({
  task,
  tones: toneOf,
  view,
  onSelect,
}: {
  task: PlanTaskView
  tones: ReadonlyMap<string, TaskTone>
  view: PlanView
  onSelect: (id: string) => void
}) {
  const tone = toneOf.get(task.id) ?? 'waiting'
  const byId = new Map(view.tasks.map((t) => [t.id, t]))
  const waitsOn = task.dependencies.flatMap((id) => byId.get(id) ?? [])
  const unblocks = view.tasks.filter((t) => t.dependencies.includes(task.id))
  const related = (label: string, tasks: PlanTaskView[]) =>
    tasks.length > 0 && (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-ink-faint">{label}</span>
        <ul className="flex flex-wrap gap-1.5">
          {tasks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                title={t.title}
                onClick={() => onSelect(t.id)}
                className="flex items-start gap-1.5 rounded-md border border-separator px-1.5 py-0.5 text-start text-ink hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:min-h-11 pointer-coarse:items-center"
              >
                <StatusMark tone={toneOf.get(t.id) ?? 'waiting'} />
                {taskLabel(t)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  return (
    <section
      aria-label={task.title}
      className="flex flex-col gap-3 p-3 text-sm"
    >
      <header className="flex flex-col gap-1">
        <h4 className="font-medium text-pretty text-ink">{task.title}</h4>
        <p className="flex items-start gap-1.5 text-xs text-ink-muted">
          <StatusMark tone={tone} />
          <span>{TONE[tone].label}</span>
          <span className="ms-auto font-mono text-ink-faint">{task.alias}</span>
        </p>
      </header>
      {task.goal && <p className="text-ink-muted">{task.goal}</p>}
      {task.description && (
        <p className="whitespace-pre-wrap text-ink-muted">{task.description}</p>
      )}
      {task.acceptanceCriteria.length > 0 && (
        <div>
          <span className="text-xs text-ink-faint">Done when</span>
          <ul className="ms-4 list-disc text-ink-muted">
            {task.acceptanceCriteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </div>
      )}
      {related('Waits on', waitsOn)}
      {related('Unblocks', unblocks)}
    </section>
  )
}

/** The plan as a list in the order it can happen: what a narrow screen shows instead of the graph. */
function PlanSummary({
  view,
  tones: toneOf,
  onOpen,
  className,
}: {
  view: PlanView
  tones: ReadonlyMap<string, TaskTone>
  onOpen: (id: string) => void
  className?: string
}) {
  const byId = new Map(view.tasks.map((task) => [task.id, task]))
  return (
    <ol
      aria-label="Tasks in the order they can happen"
      className={cn('flex flex-col py-1', className)}
    >
      {taskOrder(view.tasks).map((task) => {
        const tone = toneOf.get(task.id) ?? 'waiting'
        const after = task.dependencies
          .flatMap((id) => byId.get(id) ?? [])
          .map(taskLabel)
        return (
          <li key={task.id}>
            <button
              type="button"
              title={task.title}
              aria-label={`${task.title}, ${TONE[tone].label}`}
              onClick={() => onOpen(task.id)}
              className="flex min-h-11 w-full items-start gap-2 px-3 py-1.5 text-start text-sm hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            >
              <StatusMark tone={tone} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    'text-ink',
                    tone === 'dropped' && 'line-through',
                  )}
                >
                  {taskLabel(task)}
                </span>
                <span className="text-xs text-ink-faint">
                  {TONE[tone].label}
                  {after.length > 0 && ` · after ${after.join(', ')}`}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** The objective, two lines at most, with a way to read the rest when it runs longer. */
function Objective({
  text,
  as: Paragraph = 'p',
}: {
  text: string
  as?: 'p' | typeof DialogDescription
}) {
  const paragraph = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [clamped, setClamped] = useState(false)
  useLayoutEffect(() => {
    const element = paragraph.current
    if (!element || open) return
    const check = () =>
      setClamped(element.scrollHeight > element.clientHeight + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, open])
  return (
    <div className="flex flex-col items-start">
      <Paragraph
        ref={paragraph}
        data-plan-objective
        className={cn(
          'text-sm text-pretty text-ink-muted',
          !open && 'line-clamp-2',
        )}
      >
        {text}
      </Paragraph>
      {(clamped || open) && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:min-h-11"
        >
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  )
}

/** Below this card width the graph would not read; the card lists the tasks instead. */
export const NARROW_CARD = 480
/** The tallest the reading surface's graph grows before it shrinks to fit. */
const INLINE_MAX = 480
const INLINE_PAD = 12
/** How near the card's edge a dragged task may come, in screen pixels. */
const EDGE_GAP = 4

/** The expanded workspace: the graph to pan, zoom and drag, beside an inspector for the selected task. */
function PlanWorkspace({
  view,
  tones: toneOf,
  open,
  onOpenChange,
  selected,
  onSelect,
  done,
}: {
  view: PlanView
  tones: ReadonlyMap<string, TaskTone>
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: string | undefined
  onSelect: (id: string | undefined) => void
  done: number
}) {
  const [region, setRegion] = useState<HTMLDivElement | null>(null)
  const size = useSize(region)
  const task = view.tasks.find((t) => t.id === selected)
  // The dialog scales in, and React Flow measures handles against its own zoom only: measure them again once it has.
  const [settled, setSettled] = useState(0)
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) setSettled((count) => count + 1)
      }}
    >
      <DialogContent
        data-plan-workspace
        className="flex h-[calc(100dvh-2rem)] w-[min(1400px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden bg-artifact p-0 sm:max-w-none"
      >
        <header className="flex flex-col gap-1 border-b border-separator py-3 ps-4 pe-12">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Icon.Plan className="size-4 shrink-0 self-center text-ink-muted" />
            <DialogTitle className="min-w-0 flex-[1_1_14rem] text-base leading-snug font-medium text-pretty text-ink">
              {view.title}
            </DialogTitle>
            <span className="shrink-0 text-xs text-ink-faint tabular-nums">
              {done} of {view.tasks.length} done
            </span>
          </div>
          {view.objective && (
            <Objective text={view.objective} as={DialogDescription} />
          )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div ref={setRegion} className="relative min-h-0 flex-1">
            {open && (
              <PlanFlow
                view={view}
                tones={toneOf}
                box={
                  size && { width: size.width - 48, height: size.height - 48 }
                }
                interactive
                selected={selected}
                onSelect={onSelect}
                padding={24}
                settled={settled}
              />
            )}
          </div>
          <aside
            aria-label="Task inspector"
            className="max-h-[45%] shrink-0 overflow-y-auto border-t border-separator md:max-h-none md:w-(--spacing-inspector) md:border-s md:border-t-0"
          >
            {task ? (
              <TaskDetail
                task={task}
                tones={toneOf}
                view={view}
                onSelect={onSelect}
              />
            ) : (
              <>
                <p className="px-3 pt-3 text-xs text-ink-faint">
                  Select a task to read it in full.
                </p>
                <PlanSummary view={view} tones={toneOf} onOpen={onSelect} />
              </>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The plan in the conversation: a quiet reading surface (the graph fitted to
 * the column, or on a narrow card the tasks in order) that opens an expanded
 * workspace for inspecting it.
 */
export function PlanGraph({
  view,
  note,
}: {
  view: PlanView
  note?: string | undefined
}) {
  const toneOf = useMemo(() => taskTones(view.tasks), [view])
  const [card, setCard] = useState<HTMLDivElement | null>(null)
  const width = useSize(card)?.width
  const [layout, setLayout] = useState<PlanLayout>()
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<string>()

  const open = (id?: string) => {
    setSelected(id)
    setExpanded(true)
  }
  const done = view.tasks.filter(
    (task) => toneOf.get(task.id) === 'done',
  ).length
  const narrow = width !== undefined && width < NARROW_CARD
  const box =
    width === undefined
      ? undefined
      : { width: width - 2 * INLINE_PAD, height: INLINE_MAX - 2 * INLINE_PAD }
  const height =
    layout && box
      ? Math.min(
          INLINE_MAX,
          Math.max(
            96,
            Math.ceil(layout.height * fitScale(layout, box)) + 2 * INLINE_PAD,
          ),
        )
      : 200

  return (
    <div
      ref={setCard}
      data-plan-card
      className="my-3 overflow-hidden rounded-artifact border border-separator bg-artifact"
    >
      <header className="flex items-start gap-2 px-3 pt-2.5 pb-2">
        <Icon.Plan className="mt-0.5 size-4 shrink-0 text-ink-muted" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="min-w-0 flex-[1_1_14rem] font-medium text-pretty text-ink">
              {view.title}
            </h3>
            <span className="shrink-0 text-xs text-ink-faint tabular-nums">
              {done} of {view.tasks.length} done
            </span>
          </div>
          {view.objective && <Objective text={view.objective} />}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => open()}
          className="-me-1 shrink-0 text-ink-muted hover:text-ink pointer-coarse:size-11"
        >
          <Icon.Expand aria-hidden />
          <span className="sr-only">Expand plan</span>
        </Button>
      </header>
      {narrow ? (
        <PlanSummary
          view={view}
          tones={toneOf}
          onOpen={open}
          className="border-t border-separator"
        />
      ) : (
        <div className="relative border-t border-separator" style={{ height }}>
          {box && (
            <PlanFlow
              view={view}
              tones={toneOf}
              box={box}
              interactive={false}
              onSelect={() => {}}
              onOpen={open}
              onLayout={setLayout}
              padding={INLINE_PAD}
            />
          )}
        </div>
      )}
      {note && (
        <p className="border-t border-separator px-3 py-2 text-xs text-ink-faint">
          {note}
        </p>
      )}
      <PlanWorkspace
        view={view}
        tones={toneOf}
        open={expanded}
        onOpenChange={setExpanded}
        selected={selected}
        onSelect={setSelected}
        done={done}
      />
    </div>
  )
}

/** A written plan: Theorem's live copy once it reads back, the drafted one until then. */
const WrittenPlan: FC<{ draft: PlanView }> = ({ draft }) => {
  const card = useRef<HTMLDivElement>(null)
  // Past messages stay mounted off screen, so only a card in view keeps polling.
  const inView = useInView(card)
  const live = useQuery({
    ...livePlanQuery(draft.planId ?? ''),
    enabled: draft.planId !== undefined,
    refetchInterval: inView ? LIVE_PLAN_REFRESH_MS : false,
  })
  const view = live.data ?? draft
  const note = live.error
    ? `Showing the plan as drafted. Theorem's copy could not be read: ${describeError(live.error)}`
    : live.data === null
      ? 'Theorem no longer has this plan; showing it as drafted.'
      : undefined
  return (
    <div ref={card}>
      <PlanGraph view={view} note={note} />
    </div>
  )
}

/** The draft_plan call: a pending line while the model writes it, then the plan's graph. */
export const PlanToolCall: ToolCallMessagePartComponent = (props) => {
  const { args, result, isError, status } = props
  const draft = useMemo(
    () =>
      result !== undefined && !isError
        ? draftPlanView(args, result)
        : undefined,
    [args, result, isError],
  )
  if (draft) return <WrittenPlan draft={draft} />
  if (result === undefined && status.type === 'running') {
    const title = typeof args.title === 'string' ? args.title : undefined
    return (
      <ThinkingIndicator
        className="my-2"
        label={title ? `Drafting a plan: ${title}` : 'Drafting a plan'}
        orb="working"
      />
    )
  }
  return <ToolFallback {...props} />
}
