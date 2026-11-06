// SOURCING: lib/theorem/graphql (Theorem's `plan(planId)` query, the plan substrate's own inspect), @tanstack/react-query (the live plan while its card is on screen), @dagrejs/dagre (layered layout of the task dependency graph)
import { Graph, layout } from '@dagrejs/dagre'
import { queryOptions } from '@tanstack/react-query'
import { graphql } from './graphql'

/** The native operation a planning turn writes its plan with. */
export const DRAFT_PLAN = 'draft_plan'

/** How a task reads at a glance, from its status and what it waits on. */
export type TaskTone = 'done' | 'active' | 'ready' | 'waiting' | 'attention' | 'dropped'

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
 * and its result (the plan id and each alias's task id). Dependencies stay
 * aliases here, since the arguments name tasks that way.
 */
export function draftPlanView(args: unknown, result: unknown): PlanView | undefined {
  const draft = object(args)
  const written = object(result)
  const title = text(written.title) ?? text(draft.title)
  const tasks = list(draft.tasks).length ? list(draft.tasks) : list(written.tasks)
  if (!title || !tasks.length) return undefined
  const view: PlanView = {
    title,
    tasks: tasks.flatMap((task) => {
      const alias = text(task.alias)
      const taskTitle = text(task.title)
      if (!alias || !taskTitle) return []
      const item: PlanTaskView = {
        id: alias,
        alias,
        title: taskTitle,
        acceptanceCriteria: texts(task.acceptanceCriteria),
        dependencies: texts(task.dependencies),
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
    tasks { id alias title goal description acceptanceCriteria status dependencies }
  }
}`

/** The plan as Theorem holds it now, or undefined when Theorem has no such plan. */
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
      const status = text(task.status)
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

/** Theorem's copy of a plan, read again while its card stays on screen. */
export const livePlanQuery = (planId: string) =>
  queryOptions({
    queryKey: ['theorem', 'plan', planId],
    queryFn: async () =>
      parseLivePlan((await graphql<{ plan: unknown }>(PLAN, { planId })).plan) ?? null,
    refetchInterval: 15_000,
    staleTime: 5_000,
  })

const DONE = new Set(['done', 'completed'])
const ACTIVE = new Set(['claimed', 'in_progress', 'working', 'patch_proposed', 'verifying'])
const ATTENTION = new Set(['blocked', 'failed', 'input_required'])
const DROPPED = new Set(['cancelled', 'superseded'])

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
            : DROPPED.has(status)
              ? 'dropped'
              : task.dependencies.every(finished)
                ? 'ready'
                : 'waiting'
      return [task.id, tone]
    }),
  )
}

export type Point = { x: number; y: number }

/**
 * Top-left positions for task nodes of the given size, left to right in
 * dependency order: a task sits to the right of everything it waits on.
 * Dependencies on tasks outside the plan are ignored.
 */
export function layoutPlan(
  tasks: readonly PlanTaskView[],
  size: { width: number; height: number },
): Record<string, Point> {
  const graph = new Graph()
  graph.setGraph({ rankdir: 'LR', nodesep: 16, ranksep: 40, marginx: 8, marginy: 8 })
  graph.setDefaultEdgeLabel(() => ({}))
  const ids = new Set(tasks.map((task) => task.id))
  for (const task of tasks) graph.setNode(task.id, { ...size })
  for (const task of tasks)
    for (const dependency of task.dependencies)
      if (ids.has(dependency) && dependency !== task.id) graph.setEdge(dependency, task.id)
  layout(graph)
  const positions: Record<string, Point> = {}
  for (const id of graph.nodes()) {
    const { x, y } = graph.node(id)
    positions[id] = { x: x - size.width / 2, y: y - size.height / 2 }
  }
  return positions
}
