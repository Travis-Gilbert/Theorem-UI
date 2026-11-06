// SOURCING: @xyflow/react 12 (custom task nodes with hidden Handles, smoothstep edges with closed-arrow markers, useNodesState for drag and selection, Controls, dotted Background, fitView) after the records data-model diagram's conventions, laid out by @dagrejs/dagre through lib/theorem/plans; @tanstack/react-query for Theorem's live copy of the plan; assistant-ui's ToolCallMessagePartComponent for the draft_plan call, with the installed ToolFallback and ThinkingIndicator for its failed and running states
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
} from '@xyflow/react'
import type { Edge, Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ToolCallMessagePartComponent } from '@assistant-ui/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { ThinkingIndicator } from '@/components/assistant-ui/elements/thinking-indicator'
import { ToolFallback } from '@/components/assistant-ui/elements/tool-fallback.aui'
import { Icon } from '@/components/icons'
import { describeError } from '@/lib/theorem/client'
import {
  draftPlanView,
  layoutPlan,
  livePlanQuery,
  taskTones,
} from '@/lib/theorem/plans'
import type { PlanTaskView, PlanView, TaskTone } from '@/lib/theorem/plans'
import { cn } from '@/lib/utils'

const NODE = { width: 208, height: 64 }

const TONE: Readonly<Record<TaskTone, { label: string; dot: string }>> = {
  done: { label: 'Done', dot: 'bg-teal' },
  active: { label: 'In progress', dot: 'bg-ochre animate-pulse motion-reduce:animate-none' },
  ready: { label: 'Ready', dot: 'bg-redwood' },
  waiting: { label: 'Waiting', dot: 'border border-ink-faint' },
  attention: { label: 'Needs attention', dot: 'bg-ochre' },
  dropped: { label: 'Dropped', dot: 'bg-ink-faint' },
}

type TaskNodeData = { title: string; tone: TaskTone }
type TaskNode = Node<TaskNodeData, 'task'>

const hidden = '!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent'

function TaskNodeView({ data, selected }: NodeProps<TaskNode>) {
  const tone = TONE[data.tone]
  return (
    <div
      className={cn(
        'flex flex-col justify-center gap-1 rounded-lg border bg-raised px-2.5 text-xs shadow-sm transition-colors duration-100',
        selected ? 'border-redwood ring-1 ring-redwood' : 'border-separator',
        data.tone === 'dropped' && 'opacity-60',
      )}
      style={NODE}
    >
      <Handle type="target" position={Position.Left} className={hidden} />
      <Handle type="source" position={Position.Right} className={hidden} />
      <span className="flex items-center gap-1.5 text-ink-faint">
        <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', tone.dot)} />
        {tone.label}
      </span>
      <span
        className={cn(
          'line-clamp-2 text-sm leading-tight font-medium text-ink',
          data.tone === 'dropped' && 'line-through',
        )}
      >
        {data.title}
      </span>
    </div>
  )
}

const nodeTypes = { task: TaskNodeView }

function graphOf(view: PlanView) {
  const tones = taskTones(view.tasks)
  const positions = layoutPlan(view.tasks, NODE)
  const ids = new Set(view.tasks.map((task) => task.id))
  const nodes: TaskNode[] = view.tasks.map((task) => {
    const tone = tones.get(task.id) ?? 'waiting'
    return {
      id: task.id,
      type: 'task',
      position: positions[task.id] ?? { x: 0, y: 0 },
      data: { title: task.title, tone },
      ariaLabel: `${task.title}, ${TONE[tone].label}`,
    }
  })
  const edges: Edge[] = view.tasks.flatMap((task) =>
    task.dependencies
      .filter((dependency) => ids.has(dependency))
      .map((dependency) => ({
        id: `${dependency}->${task.id}`,
        source: dependency,
        target: task.id,
        type: 'smoothstep',
        selectable: false,
        focusable: false,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: { stroke: 'var(--color-ink-faint)', strokeWidth: 1.25 },
      })),
  )
  const height = Math.max(...nodes.map((node) => node.position.y)) + NODE.height
  return { nodes, edges, tones, height }
}

function TaskDetail({
  task,
  tone,
  view,
  onSelect,
}: {
  task: PlanTaskView
  tone: TaskTone
  view: PlanView
  onSelect: (id: string) => void
}) {
  const byId = new Map(view.tasks.map((t) => [t.id, t]))
  const waitsOn = task.dependencies.flatMap((id) => byId.get(id) ?? [])
  const unblocks = view.tasks.filter((t) => t.dependencies.includes(task.id))
  const related = (label: string, tasks: PlanTaskView[]) =>
    tasks.length > 0 && (
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="text-ink-faint">{label}</span>
        {tasks.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className="rounded-md border border-separator px-1.5 py-0.5 text-ink hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
          >
            {t.title}
          </button>
        ))}
      </div>
    )
  return (
    <section aria-label={task.title} className="flex flex-col gap-2 border-t border-separator px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', TONE[tone].dot)} />
        <h4 className="min-w-0 flex-1 font-medium text-ink">{task.title}</h4>
        <span className="text-xs text-ink-faint">{TONE[tone].label}</span>
      </div>
      {task.goal && <p className="text-ink-muted">{task.goal}</p>}
      {task.description && <p className="whitespace-pre-wrap text-ink-muted">{task.description}</p>}
      {task.acceptanceCriteria.length > 0 && (
        <div>
          <span className="text-ink-faint">Done when</span>
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

/** The plan as a graph: tasks left to right in the order they can happen, each selectable for its detail. */
export function PlanGraph({ view, note }: { view: PlanView; note?: string | undefined }) {
  const graph = useMemo(() => graphOf(view), [view])
  const [nodes, setNodes, onNodesChange] = useNodesState<TaskNode>(graph.nodes)
  const [selected, setSelected] = useState<string>()

  // A refreshed plan keeps where the person dragged a task and what they selected.
  useEffect(() => {
    setNodes((current) => {
      const before = new Map(current.map((node) => [node.id, node]))
      return graph.nodes.map((node) => {
        const previous = before.get(node.id)
        return previous
          ? { ...node, position: previous.position, selected: previous.selected ?? false }
          : node
      })
    })
  }, [graph, setNodes])

  const select = (id: string) => {
    setSelected(id)
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })))
  }

  const done = view.tasks.filter((task) => graph.tones.get(task.id) === 'done').length
  const task = view.tasks.find((t) => t.id === selected)
  const height = Math.min(Math.max(graph.height + 48, 200), 420)

  return (
    <div className="my-3 overflow-hidden rounded-artifact border border-separator bg-artifact">
      <header className="flex flex-col gap-0.5 px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-2">
          <Icon.Plan className="size-4 shrink-0 text-ink-muted" />
          <h3 className="min-w-0 flex-1 truncate font-medium text-ink">{view.title}</h3>
          <span className="shrink-0 text-xs text-ink-faint tabular-nums">
            {done} of {view.tasks.length} done
          </span>
        </div>
        {view.objective && <p className="text-sm text-ink-muted">{view.objective}</p>}
      </header>
      <div className="relative border-t border-separator" style={{ height }}>
        <ReactFlowProvider>
          <ReactFlow<TaskNode, Edge>
            nodes={nodes}
            edges={graph.edges}
            onNodesChange={onNodesChange}
            onSelectionChange={({ nodes: picked }) => setSelected(picked[0]?.id)}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={1.5}
            nodesConnectable={false}
            multiSelectionKeyCode={null}
            // The card sits in a scrolling transcript: the wheel scrolls the page, pinch and the controls zoom.
            zoomOnScroll={false}
            preventScrolling={false}
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls position="bottom-left" showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
      {task && (
        <TaskDetail task={task} tone={graph.tones.get(task.id) ?? 'waiting'} view={view} onSelect={select} />
      )}
      {note && <p className="border-t border-separator px-3 py-2 text-xs text-ink-faint">{note}</p>}
    </div>
  )
}

/** A written plan: Theorem's live copy once it reads back, the drafted one until then. */
const WrittenPlan: FC<{ draft: PlanView }> = ({ draft }) => {
  const live = useQuery({
    ...livePlanQuery(draft.planId ?? ''),
    enabled: draft.planId !== undefined,
  })
  const view = live.data ?? draft
  const note = live.error
    ? `Showing the plan as drafted. Theorem's copy could not be read: ${describeError(live.error)}`
    : live.data === null
      ? 'Theorem no longer has this plan; showing it as drafted.'
      : undefined
  return <PlanGraph view={view} note={note} />
}

/** The draft_plan call: a pending line while the model writes it, then the plan's graph. */
export const PlanToolCall: ToolCallMessagePartComponent = (props) => {
  const { args, result, isError, status } = props
  const draft = useMemo(
    () => (result !== undefined && !isError ? draftPlanView(args, result) : undefined),
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
