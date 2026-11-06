import { describe, expect, test } from 'bun:test'
import { draftPlanView, layoutPlan, parseLivePlan, taskTones } from './plans'
import type { PlanTaskView } from './plans'

const ARGS = {
  title: 'Move to Denver',
  objective: 'Live in Denver by March',
  tasks: [
    { alias: 'find-flat', title: 'Find a flat', goal: 'A signed lease', acceptanceCriteria: ['Lease signed'] },
    { alias: 'book-movers', title: 'Book movers', dependencies: ['find-flat'] },
    { alias: 'pack', title: 'Pack', dependencies: ['find-flat'] },
  ],
}
const RESULT = {
  planId: 'plan:1',
  title: 'Move to Denver',
  objective: 'Live in Denver by March',
  tasks: [
    { alias: 'find-flat', taskId: 't1', title: 'Find a flat', dependencies: [] },
    { alias: 'book-movers', taskId: 't2', title: 'Book movers', dependencies: ['find-flat'] },
    { alias: 'pack', taskId: 't3', title: 'Pack', dependencies: ['find-flat'] },
  ],
}

const task = (id: string, dependencies: string[] = [], status?: string): PlanTaskView => ({
  id,
  alias: id,
  title: id,
  acceptanceCriteria: [],
  dependencies,
  ...(status ? { status } : {}),
})

describe('draftPlanView', () => {
  test('a written draft is its tasks in full, by alias, with the plan id', () => {
    const view = draftPlanView(ARGS, RESULT)!
    expect(view.planId).toBe('plan:1')
    expect(view.objective).toBe('Live in Denver by March')
    expect(view.tasks.map((t) => t.id)).toEqual(['find-flat', 'book-movers', 'pack'])
    expect(view.tasks[0]).toMatchObject({ goal: 'A signed lease', acceptanceCriteria: ['Lease signed'] })
    expect(view.tasks[1]!.dependencies).toEqual(['find-flat'])
  })

  test('without tasks there is no plan to draw', () => {
    expect(draftPlanView({ title: 'Empty' }, { planId: 'plan:2' })).toBeUndefined()
  })
})

describe('parseLivePlan', () => {
  test("Theorem's copy keys tasks by id and keeps their status", () => {
    const view = parseLivePlan({
      planId: 'plan:1',
      plan: { title: 'Move to Denver', objective: 'Live in Denver by March', status: 'active' },
      tasks: [
        { id: 't1', alias: 'find-flat', title: 'Find a flat', goal: '', acceptanceCriteria: [], status: 'done', dependencies: [] },
        { id: 't2', alias: 'book-movers', title: 'Book movers', goal: '', acceptanceCriteria: [], status: 'pending', dependencies: ['t1'] },
      ],
    })!
    expect(view.status).toBe('active')
    expect(view.tasks).toEqual([
      { id: 't1', alias: 'find-flat', title: 'Find a flat', acceptanceCriteria: [], dependencies: [], status: 'done' },
      { id: 't2', alias: 'book-movers', title: 'Book movers', acceptanceCriteria: [], dependencies: ['t1'], status: 'pending' },
    ])
  })

  test('a plan Theorem does not have reads as none', () => {
    expect(parseLivePlan({ planId: 'plan:9', plan: null, tasks: [], reason: 'not_found' })).toBeUndefined()
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

describe('layoutPlan', () => {
  test('every task sits to the right of what it waits on, and side-by-side tasks share a column', () => {
    const size = { width: 200, height: 60 }
    const at = layoutPlan([task('a'), task('b', ['a']), task('c', ['a']), task('d', ['b', 'c'])], size)
    expect(at.b!.x).toBeGreaterThan(at.a!.x + size.width)
    expect(at.d!.x).toBeGreaterThan(at.b!.x + size.width)
    expect(at.b!.x).toBe(at.c!.x)
    expect(at.b!.y).not.toBe(at.c!.y)
  })

  test('a dependency outside the plan is ignored', () => {
    const at = layoutPlan([task('a', ['elsewhere'])], { width: 100, height: 40 })
    expect(Object.keys(at)).toEqual(['a'])
  })
})
