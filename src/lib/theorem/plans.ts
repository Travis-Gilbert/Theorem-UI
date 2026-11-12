// SOURCING: lib/theorem/graphql (Theorem's `plan(planId)` query, the plan substrate's own inspect), @tanstack/react-query (the live plan while its card is on screen), elkjs (layered layout of the task dependency graph over the nodes' measured sizes, with its orthogonal edge router giving each edge its own track, as lib/program/flow lays out programs)
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode } from 'elkjs/lib/elk-api'
import { queryOptions } from '@tanstack/react-query'
import { graphql } from './graphql'

/** The native operation a planning turn writes its plan with. */
export const DRAFT_PLAN = 'draft_plan'

/** How a task reads at a glance, from its status and what it waits on. */
export type TaskTone = 'done' | 'active' | 'ready' | 'waiting' | 'attention' | 'deviating' | 'dropped'

export type PlanTaskView = {
  /** The task id once Theorem wrote it; the draft's alias before. */
  id: string
  alias: string
  title: string
  goal?: string
  description?: string
  acceptanceCriteria: readonly string[]
  /** Ids (in the same space as `id`) of the tasks this one waits on. */
  dependencies: readonly string[]
  /** Theorem's task status; absent while the plan exists only as a draft. */
  status?: string
}

export type PlanView = {
  planId?: string
  title: string
  objective?: string
  status?: string
  tasks: readonly PlanTaskView[]
}

type Json = Record<string, unknown>

const object = (value: unknown): Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined

const texts = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : []

const list = (value: unknown): Json[] => (Array.isArray(value) ? value.map(object) : [])

/**
 * The plan a `draft_plan` call wrote, from its arguments (the tasks in full)
 * and its result (the plan id and each alias's task id). Tasks and their
 * dependencies take the ids Theorem wrote, so the live copy that replaces
 * this view names the same tasks; a task the result names no id for keeps
 * its alias.
 */
export function draftPlanView(args: unknown, result: unknown): PlanView | undefined {
  const draft = object(args)
  const written = object(result)
  const title = text(written.title) ?? text(draft.title)
  const tasks = list(draft.tasks).length ? list(draft.tasks) : list(written.tasks)
  if (!title || !tasks.length) return undefined
  const saved = new Map(
    list(written.tasks).flatMap((task) => {
      const alias = text(task.alias)
      const id = text(task.taskId)
      return alias && id ? [[alias, id] as const] : []
    }),
  )
  const idOf = (alias: string) => saved.get(alias) ?? alias
  const view: PlanView = {
    title,
    tasks: tasks.flatMap((task) => {
      const alias = text(task.alias)
      const taskTitle = text(task.title)
      if (!alias || !taskTitle) return []
      const item: PlanTaskView = {
        id: idOf(alias),
        alias,
        title: taskTitle,
        acceptanceCriteria: texts(task.acceptanceCriteria),
        dependencies: texts(task.dependencies).map(idOf),
      }
      const goal = text(task.goal)
      const description = text(task.description)
      if (goal) item.goal = goal
      if (description) item.description = description
      return [item]
    }),
  }
  const planId = text(written.planId)
  const objective = text(written.objective) ?? text(draft.objective)
  if (planId) view.planId = planId
  if (objective) view.objective = objective
  return view
}

const PLAN = `query Plan($planId: String!) {
  plan(planId: $planId) {
    planId
    reason
    plan { title objective status }
    tasks { id alias title goal description acceptanceCriteria status planStatus dependencies }
  }
}`

/**
 * The plan as Theorem holds it now, or undefined when Theorem has no such
 * plan. A task's status is the plan's own (`planStatus`: pending, claimed,
 * done); `status` is the task protocol's, where every open task is working.
 */
export function parseLivePlan(raw: unknown): PlanView | undefined {
  const payload = object(raw)
  const plan = object(payload.plan)
  const title = text(plan.title)
  const planId = text(payload.planId)
  if (!title || !planId) return undefined
  const view: PlanView = {
    planId,
    title,
    tasks: list(payload.tasks).flatMap((task) => {
      const id = text(task.id)
      if (!id) return []
      const item: PlanTaskView = {
        id,
        alias: text(task.alias) ?? id,
        title: text(task.title) ?? text(task.alias) ?? id,
        acceptanceCriteria: texts(task.acceptanceCriteria),
        dependencies: texts(task.dependencies),
      }
      const goal = text(task.goal)
      const description = text(task.description)
      const status = text(task.planStatus) ?? text(task.status)
      if (goal) item.goal = goal
      if (description) item.description = description
      if (status) item.status = status
      return [item]
    }),
  }
  const objective = text(plan.objective)
  const status = text(plan.status)
  if (objective) view.objective = objective
  if (status) view.status = status
  return view
}

/** How often a plan card on screen reads Theorem's copy again. */
export const LIVE_PLAN_REFRESH_MS = 15_000

/** Theorem's copy of a plan; its card polls it with `LIVE_PLAN_REFRESH_MS` while in view. */
export const livePlanQuery = (planId: string) =>
  queryOptions({
    queryKey: ['theorem', 'plan', planId],
    queryFn: async () =>
      parseLivePlan((await graphql<{ plan: unknown }>(PLAN, { planId })).plan) ?? null,
    staleTime: 5_000,
  })

const DONE = new Set(['done', 'completed'])
const ACTIVE = new Set(['claimed', 'in_progress', 'working', 'patch_proposed', 'verifying'])
const ATTENTION = new Set(['blocked', 'failed', 'input_required'])
const DROPPED = new Set(['cancelled', 'superseded'])
/** The worker left the plan's path and a decision is owed (the plan substrate's `deviating` transition). */
const DEVIATING = 'deviating'

/**
 * Each task's tone. A pending task whose dependencies are all done is ready:
 * that is where to start. A draft's tasks have no status yet, so its tasks
 * with no dependencies read as ready and the rest as waiting.
 */
export function taskTones(tasks: readonly PlanTaskView[]): Map<string, TaskTone> {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const finished = (id: string) => {
    const status = byId.get(id)?.status
    return status !== undefined && (DONE.has(status) || DROPPED.has(status))
  }
  return new Map(
    tasks.map((task) => {
      const status = task.status ?? 'pending'
      const tone: TaskTone = DONE.has(status)
        ? 'done'
        : ACTIVE.has(status)
          ? 'active'
          : ATTENTION.has(status)
            ? 'attention'
            : status === DEVIATING
              ? 'deviating'
              : DROPPED.has(status)
                ? 'dropped'
                : task.dependencies.every(finished)
                  ? 'ready'
                  : 'waiting'
      return [task.id, tone]
    }),
  )
}

/** An alias the model wrote as words (`audit-agent-friction`), not an opaque id. */
const WORDED_ALIAS = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+$/i

/**
 * What a task's node says: its alias in words when the model wrote one
 * (`audit-agent-friction` reads "Audit agent friction"), else its title.
 * The full title stays the task's name everywhere else.
 */
export function taskLabel(task: PlanTaskView): string {
  if (!WORDED_ALIAS.test(task.alias)) return task.title
  const words = task.alias.replace(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The tasks in the order they can happen: each after everything it waits on,
 * the plan's own order among tasks at the same depth. A dependency cycle or a
 * task outside the plan does not hold a task back.
 */
export function taskOrder(tasks: readonly PlanTaskView[]): PlanTaskView[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const depth = new Map<string, number>()
  const depthOf = (id: string, seen: ReadonlySet<string>): number => {
    const known = depth.get(id)
    if (known !== undefined) return known
    const task = byId.get(id)
    if (!task || seen.has(id)) return -1
    const inner = new Set(seen).add(id)
    const value = 1 + Math.max(-1, ...task.dependencies.map((dependency) => depthOf(dependency, inner)))
    depth.set(id, value)
    return value
  }
  return tasks
    .map((task, index) => ({ task, index, depth: depthOf(task.id, new Set()) }))
    .sort((a, b) => a.depth - b.depth || a.index - b.index)
    .map(({ task }) => task)
}

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
/** Which way dependencies run: left to right, or top to bottom. */
export type Direction = 'RIGHT' | 'DOWN'

export type PlanLayout = {
  direction: Direction
  /** Each task node's top left. */
  positions: Record<string, Point>
  /** Each dependency edge (`dependency->task`) as the router drew it, from the waited-on task to the waiting one. */
  routes: Record<string, Point[]>
  width: number
  height: number
}

/** The id of the edge from a dependency to the task that waits on it. */
export const edgeId = (dependency: string, task: string) => `${dependency}->${task}`

const elk = new ELK()

/**
 * Lays the tasks out at the sizes their nodes measured, in dependency order:
 * a task sits past everything it waits on. Columns keep room between them for
 * edges, and the orthogonal router gives edges from different tasks their own
 * tracks rather than one shared midline. Dependencies on tasks outside the
 * plan are ignored.
 */
export async function layoutPlan(
  tasks: readonly PlanTaskView[],
  sizes: Readonly<Record<string, Size>>,
  direction: Direction = 'RIGHT',
): Promise<PlanLayout> {
  const ids = new Set(tasks.map((task) => task.id))
  const input: ElkNode = {
    id: 'plan',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
      'elk.spacing.nodeNode': '24',
      'elk.spacing.edgeEdge': '14',
      'elk.spacing.edgeNode': '16',
      // The plan's own order among side-by-side tasks, so a refresh does not reshuffle them.
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.padding': '[top=8,left=8,bottom=8,right=8]',
    },
    children: tasks.map((task) => ({ id: task.id, ...(sizes[task.id] ?? { width: 160, height: 40 }) })),
    edges: tasks.flatMap((task) =>
      task.dependencies
        .filter((dependency) => ids.has(dependency) && dependency !== task.id)
        .map((dependency) => ({ id: edgeId(dependency, task.id), sources: [dependency], targets: [task.id] })),
    ),
  }
  const graph = await elk.layout(input)
  const positions: Record<string, Point> = {}
  for (const child of graph.children ?? []) positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 }
  const routes: Record<string, Point[]> = {}
  for (const edge of graph.edges ?? []) {
    const section = edge.sections?.[0]
    if (section) routes[edge.id] = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
  }
  return { direction, positions, routes, width: graph.width ?? 0, height: graph.height ?? 0 }
}

/** How far a layout must shrink to fit a box; never past its own size. */
export const fitScale = (layout: Pick<PlanLayout, 'width' | 'height'>, box: Size) =>
  Math.min(1, box.width / Math.max(layout.width, 1), box.height / Math.max(layout.height, 1))

/** The smallest scale at which a node's text still reads at its size. */
export const READABLE_SCALE = 0.8

/**
 * The layout for a box: left to right while that still reads at the box's
 * size, otherwise whichever direction shrinks less. A narrow column usually
 * takes the plan top to bottom.
 */
export async function fittedLayout(
  tasks: readonly PlanTaskView[],
  sizes: Readonly<Record<string, Size>>,
  box: Size,
): Promise<PlanLayout> {
  const across = await layoutPlan(tasks, sizes, 'RIGHT')
  if (fitScale(across, box) >= READABLE_SCALE) return across
  const down = await layoutPlan(tasks, sizes, 'DOWN')
  return fitScale(down, box) > fitScale(across, box) ? down : across
}
