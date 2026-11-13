import { describe, expect, test } from 'bun:test'
import { PLAN_UNDER_WAY, PLAN_VIEW } from '@/stories/fixtures/plan'
import {
  READABLE_SCALE,
  draftPlanView,
  edgeId,
  fitScale,
  fittedLayout,
  layoutPlan,
  parseLivePlan,
  taskLabel,
  taskOrder,
  taskTones,
} from './plans'
import type { PlanLayout, PlanTaskView, Size } from './plans'

const ARGS = {
  title: 'Move to Denver',
  objective: 'Live in Denver by March',
  tasks: [
    {
      alias: 'find-flat',
      title: 'Find a flat',
      goal: 'A signed lease',
      acceptanceCriteria: ['Lease signed'],
    },
    { alias: 'book-movers', title: 'Book movers', dependencies: ['find-flat'] },
    { alias: 'pack', title: 'Pack', dependencies: ['find-flat'] },
  ],
}
const RESULT = {
  planId: 'plan:1',
  title: 'Move to Denver',
  objective: 'Live in Denver by March',
  tasks: [
    {
      alias: 'find-flat',
      taskId: 't1',
      title: 'Find a flat',
      dependencies: [],
    },
    {
      alias: 'book-movers',
      taskId: 't2',
      title: 'Book movers',
      dependencies: ['find-flat'],
    },
    { alias: 'pack', taskId: 't3', title: 'Pack', dependencies: ['find-flat'] },
  ],
}

const task = (
  id: string,
  dependencies: string[] = [],
  status?: string,
): PlanTaskView => ({
  id,
  alias: id,
  title: id,
  acceptanceCriteria: [],
  dependencies,
  ...(status ? { status } : {}),
})

describe('draftPlanView', () => {
  test('a written draft is its tasks in full, by the ids Theorem wrote, with the plan id', () => {
    const view = draftPlanView(ARGS, RESULT)!
    expect(view.planId).toBe('plan:1')
    expect(view.objective).toBe('Live in Denver by March')
    expect(view.tasks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(view.tasks.map((t) => t.alias)).toEqual([
      'find-flat',
      'book-movers',
      'pack',
    ])
    expect(view.tasks[0]).toMatchObject({
      goal: 'A signed lease',
      acceptanceCriteria: ['Lease signed'],
    })
    expect(view.tasks[1]!.dependencies).toEqual(['t1'])
  })

  test('a task the result names no id for keeps its alias', () => {
    const view = draftPlanView(ARGS, {
      planId: 'plan:1',
      title: 'Move to Denver',
      tasks: [],
    })!
    expect(view.tasks.map((t) => t.id)).toEqual([
      'find-flat',
      'book-movers',
      'pack',
    ])
    expect(view.tasks[1]!.dependencies).toEqual(['find-flat'])
  })

  test('without tasks there is no plan to draw', () => {
    expect(
      draftPlanView({ title: 'Empty' }, { planId: 'plan:2' }),
    ).toBeUndefined()
  })
})

describe('parseLivePlan', () => {
  test("Theorem's copy keys tasks by id and reads the plan's own status", () => {
    const view = parseLivePlan({
      planId: 'plan:1',
      plan: {
        title: 'Move to Denver',
        objective: 'Live in Denver by March',
        status: 'active',
      },
      tasks: [
        // As Theorem answers: `status` is the task protocol's, where an open task is working.
        {
          id: 't1',
          alias: 'find-flat',
          title: 'Find a flat',
          goal: '',
          acceptanceCriteria: [],
          status: 'completed',
          planStatus: 'done',
          dependencies: [],
        },
        {
          id: 't2',
          alias: 'book-movers',
          title: 'Book movers',
          goal: '',
          acceptanceCriteria: [],
          status: 'working',
          planStatus: 'pending',
          dependencies: ['t1'],
        },
      ],
    })!
    expect(view.status).toBe('active')
    expect(view.tasks).toEqual([
      {
        id: 't1',
        alias: 'find-flat',
        title: 'Find a flat',
        acceptanceCriteria: [],
        dependencies: [],
        status: 'done',
      },
      {
        id: 't2',
        alias: 'book-movers',
        title: 'Book movers',
        acceptanceCriteria: [],
        dependencies: ['t1'],
        status: 'pending',
      },
    ])
  })

  test('a plan Theorem does not have reads as none', () => {
    expect(
      parseLivePlan({
        planId: 'plan:9',
        plan: null,
        tasks: [],
        reason: 'not_found',
      }),
    ).toBeUndefined()
  })
})

describe('taskTones', () => {
  test('a pending task whose dependencies are finished is where to start', () => {
    const tones = taskTones([
      task('a', [], 'done'),
      task('b', ['a'], 'pending'),
      task('c', ['b'], 'pending'),
      task('d', [], 'in_progress'),
      task('e', [], 'blocked'),
      task('f', [], 'superseded'),
      task('g', ['f'], 'pending'),
    ])
    expect(Object.fromEntries(tones)).toEqual({
      a: 'done',
      b: 'ready',
      c: 'waiting',
      d: 'active',
      e: 'attention',
      f: 'dropped',
      g: 'ready',
    })
  })

  test("a draft's tasks with nothing to wait on are ready", () => {
    const tones = taskTones([task('a'), task('b', ['a'])])
    expect(Object.fromEntries(tones)).toEqual({ a: 'ready', b: 'waiting' })
  })
})

describe('the harness plan', () => {
  test("its nodes say each task's alias in words, shorter than the title it stands for", () => {
    expect(PLAN_VIEW.tasks.map(taskLabel)).toEqual([
      'Audit agent friction',
      'Pin scope',
      'Tool surface map',
      'Error guidance',
      'Continuity contract',
      'Front door tools',
      'Agent quickstart',
      'Friction regression check',
    ])
    for (const t of PLAN_VIEW.tasks)
      expect(taskLabel(t).length).toBeLessThan(t.title.length / 2)
  })

  test('a task whose alias is not words is labelled by its title', () => {
    expect(taskLabel({ ...task('t1'), title: 'Find a flat' })).toBe(
      'Find a flat',
    )
  })

  test('drafted, its two roots are where to start; under way, a deviating task owes a decision', () => {
    const drafted = taskTones(PLAN_VIEW.tasks)
    const tone = (view: typeof PLAN_VIEW, alias: string) =>
      taskTones(view.tasks).get(view.tasks.find((t) => t.alias === alias)!.id)
    expect([...drafted.values()].filter((t) => t === 'ready')).toHaveLength(2)
    expect(tone(PLAN_VIEW, 'audit-agent-friction')).toBe('ready')
    expect(tone(PLAN_VIEW, 'pin-scope')).toBe('ready')
    expect(tone(PLAN_VIEW, 'continuity-contract')).toBe('waiting')
    expect(tone(PLAN_UNDER_WAY, 'audit-agent-friction')).toBe('active')
    expect(tone(PLAN_UNDER_WAY, 'pin-scope')).toBe('deviating')
    expect(tone(PLAN_UNDER_WAY, 'continuity-contract')).toBe('waiting')
  })

  test('in order, every task comes after everything it waits on', () => {
    const order = taskOrder(PLAN_VIEW.tasks).map((t) => t.id)
    expect(
      order
        .slice(0, 2)
        .map((id) => PLAN_VIEW.tasks.find((t) => t.id === id)!.alias),
    ).toEqual(['audit-agent-friction', 'pin-scope'])
    for (const t of PLAN_VIEW.tasks)
      for (const dependency of t.dependencies)
        expect(order.indexOf(dependency)).toBeLessThan(order.indexOf(t.id))
  })
})

/** Node sizes as a browser measures them: a label wraps at 208px, one line 19px tall plus padding. */
const MEASURED: Record<string, Size> = Object.fromEntries(
  PLAN_VIEW.tasks.map((t, index) => {
    const width = Math.min(208, 34 + taskLabel(t).length * 7)
    // One task wraps to three lines, as a long label would.
    const lines = index === 3 ? 3 : Math.ceil((taskLabel(t).length * 7) / 174)
    return [t.id, { width, height: 14 + 19 * lines }]
  }),
)

type Rect = { x: number; y: number; width: number; height: number }
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height
const rects = (layout: PlanLayout) =>
  PLAN_VIEW.tasks.map((t) => ({
    id: t.id,
    ...layout.positions[t.id]!,
    ...MEASURED[t.id]!,
  }))

/** Each straight piece of each route, with the task it leaves from. */
const segments = (layout: PlanLayout) =>
  Object.entries(layout.routes).flatMap(([id, points]) =>
    points
      .slice(1)
      .map((end, index) => ({
        source: id.split('->')[0]!,
        start: points[index]!,
        end,
      })),
  )

describe('layoutPlan', () => {
  for (const direction of ['RIGHT', 'DOWN'] as const)
    test(`at measured sizes no two of the eight tasks overlap, and each sits past what it waits on (${direction})`, async () => {
      const layout = await layoutPlan(PLAN_VIEW.tasks, MEASURED, direction)
      const placed = rects(layout)
      for (const [index, a] of placed.entries())
        for (const b of placed.slice(index + 1))
          expect({ a: a.id, b: b.id, overlap: overlaps(a, b) }).toEqual({
            a: a.id,
            b: b.id,
            overlap: false,
          })
      const axis = direction === 'RIGHT' ? 'x' : 'y'
      const extent = direction === 'RIGHT' ? 'width' : 'height'
      const at = new Map(placed.map((r) => [r.id, r]))
      for (const t of PLAN_VIEW.tasks)
        for (const dependency of t.dependencies)
          expect(at.get(t.id)![axis]).toBeGreaterThan(
            at.get(dependency)![axis] + at.get(dependency)![extent],
          )
      expect(layout.width).toBeGreaterThan(0)
      expect(layout.height).toBeGreaterThan(0)
    })

  test('every dependency is routed from its task to the one waiting on it, on its own track, around the other tasks', async () => {
    const layout = await layoutPlan(PLAN_VIEW.tasks, MEASURED, 'RIGHT')
    const edges = PLAN_VIEW.tasks.flatMap((t) =>
      t.dependencies.map((d) => edgeId(d, t.id)),
    )
    expect(Object.keys(layout.routes).sort()).toEqual(edges.sort())
    const at = new Map(rects(layout).map((r) => [r.id, r]))
    for (const [id, points] of Object.entries(layout.routes)) {
      const [from, to] = id.split('->') as [string, string]
      // Leaves the right side of the task it starts at and arrives at the left side of the other.
      expect(points[0]!.x).toBeCloseTo(at.get(from)!.x + at.get(from)!.width, 0)
      expect(points.at(-1)!.x).toBeCloseTo(at.get(to)!.x, 0)
    }
    const pieces = segments(layout)
    const vertical = pieces.filter(
      (s) => s.start.x === s.end.x && s.start.y !== s.end.y,
    )
    for (const [index, a] of vertical.entries())
      for (const b of vertical.slice(index + 1)) {
        if (a.source === b.source || a.start.x !== b.start.x) continue
        const [a0, a1] = [
          Math.min(a.start.y, a.end.y),
          Math.max(a.start.y, a.end.y),
        ]
        const [b0, b1] = [
          Math.min(b.start.y, b.end.y),
          Math.max(b.start.y, b.end.y),
        ]
        expect({ x: a.start.x, shared: a0 < b1 && b0 < a1 }).toEqual({
          x: a.start.x,
          shared: false,
        })
      }
    // Edges into one task arrive at their own points, not one shared handle.
    const arrivals = Object.entries(layout.routes).map(
      ([id, points]) => `${id.split('->')[1]}@${points.at(-1)!.y}`,
    )
    expect(new Set(arrivals).size).toBe(arrivals.length)
    // And no route runs through a task it does not join.
    for (const piece of pieces) {
      const box = {
        x: Math.min(piece.start.x, piece.end.x),
        y: Math.min(piece.start.y, piece.end.y),
        width: Math.abs(piece.end.x - piece.start.x) || 0.01,
        height: Math.abs(piece.end.y - piece.start.y) || 0.01,
      }
      const crossed = rects(layout).filter((r) =>
        overlaps(box, {
          x: r.x + 1,
          y: r.y + 1,
          width: r.width - 2,
          height: r.height - 2,
        }),
      )
      expect(crossed.map((r) => r.id)).toEqual([])
    }
  })

  test('a dependency outside the plan is ignored', async () => {
    const layout = await layoutPlan([task('a', ['elsewhere'])], {
      a: { width: 100, height: 40 },
    })
    expect(Object.keys(layout.positions)).toEqual(['a'])
    expect(layout.routes).toEqual({})
  })
})

describe('fittedLayout', () => {
  test('a wide column reads the plan left to right; a narrow one takes it top to bottom', async () => {
    const wide = await fittedLayout(PLAN_VIEW.tasks, MEASURED, {
      width: 1040,
      height: 456,
    })
    expect(wide.direction).toBe('RIGHT')
    expect(fitScale(wide, { width: 1040, height: 456 })).toBeGreaterThanOrEqual(
      READABLE_SCALE,
    )
    const column = await fittedLayout(PLAN_VIEW.tasks, MEASURED, {
      width: 560,
      height: 456,
    })
    expect(column.direction).toBe('DOWN')
  })
})
