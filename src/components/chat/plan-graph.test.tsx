// SOURCING: bun:test over the plan card, rendered with React into happy-dom under React Flow's own test shim (test/layout) with task nodes measured from their labels the way a browser wraps them, over the committed eight-task plan (src/stories/fixtures/plan), with Theorem's /graphql answered in-process
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { mockLayout } from '../../../test/layout'
import {
  buttonNamed,
  cleanup,
  click,
  render,
  waitFor,
} from '../../../test/blocks/render'
import { act } from 'react'
import { PlanGraph, PlanToolCall } from './plan-graph'
import {
  LIVE_PLAN_REFRESH_MS,
  layoutPlan,
  taskLabel,
} from '@/lib/theorem/plans'
import type { Size } from '@/lib/theorem/plans'
import {
  PLAN_ARGS,
  PLAN_RESULT,
  PLAN_UNDER_WAY,
  PLAN_VIEW,
  livePlanPayload,
} from '@/stories/fixtures/plan'

const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
let unmockLayout: () => void
let unmeasure: () => void
const realFetch = window.fetch

/**
 * A task node measures as a browser lays its label out: as wide as the words
 * up to the node's 208px measure, a 19px line for every 174px of words, and
 * the node's padding. happy-dom does no layout, so without this every node
 * would measure as the whole viewport.
 */
const nodeSize = (label: string): Size => ({
  width: Math.min(208, 34 + label.length * 7),
  height: 14 + 19 * Math.ceil((label.length * 7) / 174),
})
function measureNodes() {
  const saved = (['offsetWidth', 'offsetHeight'] as const).map(
    (key) =>
      [
        key,
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)!,
      ] as const,
  )
  for (const [key, descriptor] of saved)
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement) {
        const label = this.classList.contains('react-flow__node')
          ? this.querySelector('[data-plan-label]')?.textContent
          : undefined
        if (label === undefined) return descriptor.get!.call(this)
        const size = nodeSize(label)
        return key === 'offsetWidth' ? size.width : size.height
      },
    })
  return () => {
    for (const [key, descriptor] of saved)
      Object.defineProperty(HTMLElement.prototype, key, descriptor)
  }
}

beforeAll(() => {
  page.setURL('http://localhost:3000/')
  unmockLayout = mockLayout()
  unmeasure = measureNodes()
  // The thinking indicator splits its label into words, which waits on fonts; happy-dom has none.
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { status: 'loaded', ready: Promise.resolve() },
  })
})
afterAll(() => {
  page.setURL('about:blank')
  unmeasure()
  unmockLayout()
  Reflect.deleteProperty(document, 'fonts')
})
afterEach(async () => {
  await cleanup()
  window.fetch = realFetch
})

const byAlias = (alias: string) =>
  PLAN_VIEW.tasks.find((t) => t.alias === alias)!
const card = () => document.querySelector<HTMLElement>('[data-plan-card]')!
const workspace = () =>
  document.querySelector<HTMLElement>('[data-plan-workspace]')
const nodes = (root: ParentNode = card()) => [
  ...root.querySelectorAll<HTMLElement>('.react-flow__node'),
]
const node = (title: string, root: ParentNode = card()) =>
  nodes(root).find((element) =>
    element.getAttribute('aria-label')?.startsWith(title),
  )
/** The card's graph once its nodes have measured and ELK has placed them. */
const laidOut = (root: ParentNode = card()) =>
  waitFor(() => {
    const flow = root.querySelector('.react-flow')
    return (
      flow &&
      !flow.classList.contains('opacity-0') &&
      nodes(root).length === PLAN_VIEW.tasks.length &&
      flow
    )
  })
const positionOf = (element: HTMLElement) => {
  const [, x, y] =
    /translate\((-?[\d.]+)px, ?(-?[\d.]+)px\)/.exec(element.style.transform) ??
    []
  return { x: Number(x), y: Number(y) }
}
const openTask = (alias: string) =>
  click(node(byAlias(alias).title)!.querySelector('button')!)

test('the harness plan draws each task as a node saying its label in full, its status a mark beside it, an edge per dependency', async () => {
  await render(<PlanGraph view={PLAN_VIEW} />)
  await laidOut()
  expect(card().textContent).toContain(
    "Make Theorem's harness easier for agents to use",
  )
  expect(card().textContent).toContain('0 of 8 done')
  for (const task of PLAN_VIEW.tasks) {
    const element = node(task.title)!
    const tone = ['audit-agent-friction', 'pin-scope'].includes(task.alias)
      ? 'Ready'
      : 'Waiting'
    expect(element.getAttribute('aria-label')).toBe(`${task.title}, ${tone}`)
    // The label whole: no clamp, truncation or fixed size anywhere between it and the node.
    const label = element.querySelector<HTMLElement>('[data-plan-label]')!
    expect(label.textContent).toBe(taskLabel(task))
    for (
      let at: HTMLElement | null = label;
      at && at !== element.parentElement;
      at = at.parentElement
    ) {
      expect(at.className).not.toMatch(
        /line-clamp|truncate|text-ellipsis|overflow-hidden|\bh-\d/,
      )
      expect(at.style.height).toBe('')
      expect(at.style.width).toBe('')
    }
    // Status takes no row: the mark sits in the label's own row and says nothing visible.
    const mark = element.querySelector<HTMLElement>('[data-plan-mark]')!
    expect(mark.parentElement).toBe(label.parentElement)
    expect(mark.parentElement!.className).toMatch(/\bflex\b/)
    expect(mark.parentElement!.className).not.toMatch(/flex-col/)
    expect(mark.parentElement!.children).toHaveLength(2)
    expect(element.textContent).toBe(taskLabel(task))
    // The full title is a hover away, and in the inspector.
    expect(element.querySelector('button')!.title).toBe(task.title)
  }
  await waitFor(() => card().querySelectorAll('.react-flow__edge').length === 9)
})

test('the tasks are laid out at the sizes React Flow measured, and no two of them overlap', async () => {
  await render(<PlanGraph view={PLAN_VIEW} />)
  await laidOut()
  const sizes = Object.fromEntries(
    PLAN_VIEW.tasks.map((t) => [t.id, nodeSize(taskLabel(t))]),
  )
  // A long label wraps, so the nodes are not one fixed size.
  expect(
    new Set(Object.values(sizes).map((s) => s.height)).size,
  ).toBeGreaterThan(1)
  const expected = await layoutPlan(PLAN_VIEW.tasks, sizes, 'RIGHT')
  const placed = PLAN_VIEW.tasks.map((t) => ({
    id: t.alias,
    ...positionOf(node(t.title)!),
    ...sizes[t.id]!,
  }))
  for (const [index, t] of PLAN_VIEW.tasks.entries()) {
    expect(placed[index]!.x).toBeCloseTo(expected.positions[t.id]!.x, 3)
    expect(placed[index]!.y).toBeCloseTo(expected.positions[t.id]!.y, 3)
  }
  for (const [index, a] of placed.entries())
    for (const b of placed.slice(index + 1)) {
      const overlap =
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height
      expect({ a: a.id, b: b.id, overlap }).toEqual({
        a: a.id,
        b: b.id,
        overlap: false,
      })
    }
  // Each edge follows its own route rather than a step on the columns' midline.
  await waitFor(
    () => card().querySelectorAll('.react-flow__edge-path').length === 9,
  )
  const paths = [...card().querySelectorAll('.react-flow__edge-path')].map(
    (p) => p.getAttribute('d'),
  )
  expect(new Set(paths).size).toBe(9)
  for (const d of paths) expect(d).toMatch(/^M[\d.,-]+(L[\d.,-]+)+$/)
})

test('the objective is held to two lines on the card, and reads in full in the workspace', async () => {
  await render(<PlanGraph view={PLAN_VIEW} />)
  const objective = card().querySelector<HTMLElement>('[data-plan-objective]')!
  expect(objective.className).toContain('line-clamp-2')
  expect(objective.textContent).toBe(PLAN_ARGS.objective)
  await click(buttonNamed(card(), 'Expand plan')!)
  const dialog = await waitFor(workspace)
  expect(dialog.getAttribute('role')).toBe('dialog')
  expect(dialog.textContent).toContain(PLAN_ARGS.objective)
  // Nothing selected yet: the inspector lists the tasks to pick from.
  expect(
    dialog.querySelectorAll('[aria-label="Task inspector"] li'),
  ).toHaveLength(8)
})

/** The tasks React Flow will not let a person drag, by id: ids, not elements, so a failure prints a short list. */
const undraggable = (root: ParentNode = card()) =>
  nodes(root)
    .filter((element) => !element.classList.contains('draggable'))
    .map((element) => element.dataset.id)

test('tasks drag on the card as they do in the workspace', async () => {
  await render(<PlanGraph view={PLAN_VIEW} />)
  await laidOut()
  expect(undraggable()).toEqual([])
  await openTask('pin-scope')
  const dialog = await waitFor(workspace)
  await laidOut(dialog)
  expect(undraggable(dialog)).toEqual([])
})

test('a task on the card opens the workspace on it, with its full title, and its neighbours select from the inspector', async () => {
  await render(<PlanGraph view={PLAN_VIEW} />)
  await laidOut()
  await openTask('continuity-contract')
  const dialog = await waitFor(workspace)
  await laidOut(dialog)
  const contract = byAlias('continuity-contract')
  const detail = await waitFor(() =>
    dialog.querySelector(`section[aria-label="${contract.title}"]`),
  )
  expect(detail.querySelector('h4')!.textContent).toBe(contract.title)
  expect(detail.textContent).toContain('continuity-contract')
  expect(detail.textContent).toContain('Waits on')
  await waitFor(() =>
    node(contract.title, dialog)?.classList.contains('selected'),
  )
  const neighbour = [...detail.querySelectorAll('button')].find(
    (b) => b.textContent === 'Pin scope',
  )!
  expect(neighbour.title).toBe(byAlias('pin-scope').title)
  await click(neighbour)
  const pin = byAlias('pin-scope')
  const next = await waitFor(() =>
    dialog.querySelector(`section[aria-label="${pin.title}"]`),
  )
  expect(next.textContent).toContain(pin.goal!)
  expect(next.textContent).toContain(
    'Out-of-scope areas listed with the reason for each',
  )
  expect(next.textContent).toContain('Unblocks')
  await waitFor(() => node(pin.title, dialog)?.classList.contains('selected'))
})

test('Backspace on a selected task leaves it in the plan', async () => {
  await render(<PlanGraph view={PLAN_VIEW} />)
  await laidOut()
  await openTask('agent-quickstart')
  const dialog = await waitFor(workspace)
  await laidOut(dialog)
  // React Flow deletes on the render where the key reads pressed, so the key comes up separately.
  for (const type of ['keydown', 'keyup']) {
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent(type, {
          key: 'Backspace',
          code: 'Backspace',
          bubbles: true,
        }),
      )
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
  }
  expect(node(byAlias('agent-quickstart').title, dialog)).toBeDefined()
  expect(nodes(dialog)).toHaveLength(8)
})

test('under way, a claimed task reads in progress and a deviating one as owing a decision', async () => {
  await render(<PlanGraph view={PLAN_UNDER_WAY} />)
  await laidOut()
  const audit = node(byAlias('audit-agent-friction').title)!
  const pin = node(byAlias('pin-scope').title)!
  expect(audit.getAttribute('aria-label')).toEndWith(', In progress')
  expect(pin.getAttribute('aria-label')).toEndWith(
    ', Deviating: needs a decision',
  )
  expect(
    pin.querySelector('[data-plan-mark]')!.getAttribute('data-plan-mark'),
  ).toBe('deviating')
  expect(card().textContent).toContain('0 of 8 done')
})

test('on a narrow card the plan is a list in the order it can happen, and a task opens the workspace', async () => {
  unmockLayout()
  const unmockNarrow = mockLayout({ width: 360, height: 800 })
  try {
    await render(<PlanGraph view={PLAN_VIEW} />)
    const list = await waitFor(() => card().querySelector('ol'))
    expect(card().querySelector('.react-flow')).toBeNull()
    const rows = [...list.querySelectorAll('button')]
    expect(rows.map((row) => row.textContent)).toEqual([
      'Audit agent frictionReady',
      'Pin scopeReady',
      'Tool surface mapWaiting · after Audit agent friction, Pin scope',
      'Error guidanceWaiting · after Audit agent friction',
      'Continuity contractWaiting · after Pin scope',
      'Front door toolsWaiting · after Tool surface map',
      'Agent quickstartWaiting · after Front door tools, Continuity contract',
      'Friction regression checkWaiting · after Error guidance, Agent quickstart',
    ])
    await click(rows[4]!)
    const dialog = await waitFor(workspace)
    await waitFor(() =>
      dialog.querySelector(
        `section[aria-label="${byAlias('continuity-contract').title}"]`,
      ),
    )
  } finally {
    unmockNarrow()
    unmockLayout = mockLayout()
  }
})

const call = (overrides: Partial<ToolCallMessagePartProps>) =>
  ({
    type: 'tool-call',
    toolCallId: 'call-1',
    toolName: 'draft_plan',
    argsText: '',
    args: PLAN_ARGS,
    status: { type: 'complete' },
    addResult: () => {},
    resume: () => {},
    ...overrides,
  }) as unknown as ToolCallMessagePartProps

/** Theorem's copy once the audit is done. */
const LIVE = livePlanPayload({ 'audit-agent-friction': 'done' })

const queryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })
const audit = byAlias('audit-agent-friction')
const errors = byAlias('error-guidance')

test("a written plan reads Theorem's copy, so its tasks show their live status", async () => {
  const asked: unknown[] = []
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    if (new URL(request.url).pathname !== '/graphql')
      return Response.json({}, { status: 404 })
    asked.push(await request.json())
    return Response.json({ data: { plan: LIVE } })
  }) as typeof fetch
  const client = queryClient()
  const Call = PlanToolCall
  await render(
    <QueryClientProvider client={client}>
      <Call
        {...call({
          result: {
            planId: PLAN_RESULT.planId,
            title: PLAN_ARGS.title,
            tasks: [],
          },
        })}
      />
    </QueryClientProvider>,
  )
  await waitFor(
    () =>
      node(audit.title)?.getAttribute('aria-label') === `${audit.title}, Done`,
  )
  expect(node(errors.title)?.getAttribute('aria-label')).toBe(
    `${errors.title}, Ready`,
  )
  expect(document.body.textContent).toContain('1 of 8 done')
  expect(asked[0]).toMatchObject({ variables: { planId: PLAN_RESULT.planId } })
  client.clear()
})

test("a task selected on the drafted plan stays selected when Theorem's copy arrives", async () => {
  let answer = () => {}
  const held = new Promise<void>((resolve) => {
    answer = resolve
  })
  window.fetch = (async () => {
    await held
    return Response.json({ data: { plan: LIVE } })
  }) as unknown as typeof fetch
  const client = queryClient()
  const Call = PlanToolCall
  await render(
    <QueryClientProvider client={client}>
      <Call {...call({ result: PLAN_RESULT })} />
    </QueryClientProvider>,
  )
  await laidOut()
  await openTask('error-guidance')
  const dialog = await waitFor(workspace)
  const drafted = await waitFor(() =>
    dialog.querySelector(`section[aria-label="${errors.title}"]`),
  )
  expect(drafted.textContent).toContain('Waiting')
  answer()
  await waitFor(
    () =>
      node(audit.title)?.getAttribute('aria-label') === `${audit.title}, Done`,
  )
  expect(
    dialog.querySelector(`section[aria-label="${errors.title}"]`)?.textContent,
  ).toContain('Ready')
  client.clear()
})

test('a plan card polls Theorem only while it is in view', async () => {
  window.fetch = (async () =>
    Response.json({ data: { plan: LIVE } })) as unknown as typeof fetch
  // happy-dom never reports an intersection; this observer reports what the test
  // says. Under happy-dom an element is not an instance of the global EventTarget,
  // so framer-motion never calls observe(); it keys entries by target only, so a
  // stand-in element serves.
  let report: (isIntersecting: boolean) => void = () => {}
  const Real = globalThis.IntersectionObserver
  globalThis.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) {
      const target = document.createElement('div')
      report = (isIntersecting) =>
        callback(
          [{ target, isIntersecting } as unknown as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        )
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver
  try {
    const client = queryClient()
    const Call = PlanToolCall
    await render(
      <QueryClientProvider client={client}>
        <Call {...call({ result: PLAN_RESULT })} />
      </QueryClientProvider>,
    )
    const interval = () =>
      client
        .getQueryCache()
        .find({ queryKey: ['theorem', 'plan', PLAN_RESULT.planId] })
        ?.observers[0]?.options.refetchInterval
    await waitFor(
      () =>
        node(audit.title)?.getAttribute('aria-label') ===
        `${audit.title}, Done`,
    )
    expect(interval()).toBe(false)
    await act(async () => report(true))
    await waitFor(() => interval() === LIVE_PLAN_REFRESH_MS)
    await act(async () => report(false))
    await waitFor(() => interval() === false)
    client.clear()
  } finally {
    globalThis.IntersectionObserver = Real
  }
})

test('while the model writes the plan, the call is a pending line', async () => {
  const Call = PlanToolCall
  await render(<Call {...call({ status: { type: 'running' } })} />)
  expect(document.body.textContent).toContain(
    `Drafting a plan: ${PLAN_ARGS.title}`,
  )
  expect(document.querySelector('.react-flow')).toBeNull()
})
